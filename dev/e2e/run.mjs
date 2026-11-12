import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
import { availableParallelism } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { chromiumExecutablePath } from './browser.mjs'
import { chromeShim } from './chrome-shim.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SCENARIO_DIR = join(HERE, 'scenarios')
const ARTIFACTS = join(HERE, 'artifacts')
const PROFILE = join(HERE, '.profile')
const PORT = Number(process.env.PORT ?? 4173)
const BASE_URL = `http://localhost:${PORT}`
const SCENARIO_TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 30000)

/**
 * How many browsers to run at once. Each scenario is a page in its own browser with its own
 * profile, so the suite is limited by the slowest one instead of by their sum; `E2E_WORKERS`
 * pins the number and `E2E_WORKERS=1` reproduces the old serial run.
 */
function workerCount(scenarioCount) {
	const requested = Number(process.env.E2E_WORKERS ?? Math.min(4, availableParallelism()))
	if (!Number.isFinite(requested) || requested < 1) return 1
	return Math.min(Math.floor(requested), Math.max(1, scenarioCount))
}

/** The worker indexes to run, and so the profiles to prepare. */
function profiles(count) {
	return Array.from({ length: count }, (_, index) => index)
}

/**
 * A worker's browser profile. One worker keeps the historical `.profile`, so a single-worker
 * run still shares its state across runs the way it always did.
 */
function profilePath(index, count) {
	return count === 1 ? PROFILE : `${PROFILE}-${index}`
}

function withTimeout(promise, ms, name) {
	let timer
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(() => reject(new Error(`Scenario "${name}" timed out after ${ms} ms`)), ms)
	})
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function startServer() {
	const server = spawn(process.execPath, [join(ROOT, 'scripts', 'serve.js')], {
		cwd: ROOT,
		env: { ...process.env, PORT: String(PORT) },
		stdio: ['ignore', 'pipe', 'inherit'],
	})
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('Harness server did not start')), 10000)
		server.stdout.on('data', (chunk) => {
			if (chunk.toString().includes('Harness server')) {
				clearTimeout(timer)
				resolve(server)
			}
		})
		server.on('exit', (code) => reject(new Error(`Harness server exited with ${code}`)))
	})
}

async function loadScenarios(filter) {
	const files = (await readdir(SCENARIO_DIR)).filter((name) => name.endsWith('.mjs')).sort()
	const scenarios = []
	for (const file of files) {
		const module = await import(join(SCENARIO_DIR, file))
		if (!filter || file.includes(filter)) {
			scenarios.push({ file, ...module })
		}
	}
	return scenarios
}

function createContext(page, name) {
	const errors = []
	const consoleErrors = []
	const expectedConsoleErrors = []
	const failedRequests = []
	page.on('pageerror', (error) => errors.push(error.message))
	page.on('console', (message) => {
		if (message.type() === 'error') consoleErrors.push(message.text())
	})
	page.on('response', (response) => {
		if (response.status() >= 400) {
			failedRequests.push(`${response.status()} ${response.url()}`)
		}
	})
	page.on('requestfailed', (request) => {
		failedRequests.push(`FAILED ${request.url()} (${request.failure()?.errorText})`)
	})

	/**
	 * Open the panel with a harness config:
	 * `{ settings, tab, extraction, selection, storage }`.
	 */
	async function openWith(config) {
		await page.addInitScript(chromeShim, config ?? {})
		await page.goto(`${BASE_URL}/side-panel.html`)
		await page.waitForSelector('.app, .boot', { timeout: 15000 })
	}

	return {
		page,
		errors,
		consoleErrors,
		openWith,
		/** Marks a console error as expected for this scenario. */
		expectConsoleError(pattern) {
			expectedConsoleErrors.push(pattern)
		},
		async open(scenario) {
			await openWith(scenario)
		},
		/**
		 * Open the settings page with the same shim, optionally at a section:
		 * `hash` is the fragment to load, e.g. `'#prompt-templates'`.
		 */
		async openSettings(config, hash = '') {
			await page.addInitScript(chromeShim, config ?? {})
			await page.goto(`${BASE_URL}/settings.html${hash}`)
			await page.waitForSelector('.settings', { timeout: 15000 })
		},
		waitFor(fn, arg, options) {
			return page.waitForFunction(fn, arg, { timeout: 15000, ...options })
		},
		async shot(label) {
			const path = join(ARTIFACTS, `${name.replace(/[^a-z0-9]+/gi, '-')}-${label}.png`)
			await page.screenshot({ path, fullPage: true })
			return path
		},
		async clean() {
			if (errors.length) {
				throw new Error(`Page errors:\n  ${errors.join('\n  ')}`)
			}
			const unexpected = consoleErrors.filter(
				(text) => !expectedConsoleErrors.some((pattern) => pattern.test(text)),
			)
			if (unexpected.length) {
				throw new Error(
					`Console errors:\n  ${unexpected.join('\n  ')}` +
						(failedRequests.length ? `\nFailed requests:\n  ${failedRequests.join('\n  ')}` : ''),
				)
			}
		},
	}
}

async function main() {
	const filter = process.argv[2]
	await rm(ARTIFACTS, { recursive: true, force: true })
	await mkdir(ARTIFACTS, { recursive: true })

	const scenarios = await loadScenarios(filter)
	const workers = workerCount(scenarios.length)

	if (process.env.E2E_FRESH_PROFILE) {
		await rm(PROFILE, { recursive: true, force: true })
		for (const index of profiles(workers)) await rm(profilePath(index, workers), { recursive: true, force: true })
	}

	const server = await startServer()
	const failures = []

	/**
	 * One browser per worker, each on its own profile: a scenario's settings and chats live in
	 * chrome.storage and IndexedDB, which are per-profile, so this is what makes running them
	 * at the same time safe. Scenarios are handed out one at a time from a shared cursor, so a
	 * slow one never blocks a worker that is free.
	 */
	let next = 0
	const runWorker = async (index) => {
		const context = await chromium.launchPersistentContext(profilePath(index, workers), {
			executablePath: chromiumExecutablePath(),
			headless: true,
			args: ['--no-sandbox'],
		})
		try {
			for (;;) {
				const scenario = scenarios[next]
				if (!scenario) return
				next += 1
				const lines = []
				const name = scenario.name ?? scenario.file.replace('.mjs', '')
				const page = await context.newPage()
				await page.setViewportSize({ width: 520, height: 1100 })
				const ctx = createContext(page, name)
				const started = Date.now()
				try {
					await withTimeout(scenario.run(ctx), SCENARIO_TIMEOUT_MS, name)
					await ctx.clean()
					lines.push(`✔ ${name} (${Date.now() - started} ms)`)
				} catch (error) {
					failures.push({ name, error })
					const shot = await ctx.shot('failure').catch(() => null)
					lines.push(`✖ ${name} (${Date.now() - started} ms)`)
					lines.push(
						...String(error.message)
							.split('\n')
							.map((line) => `  ${line}`),
					)
					if (shot) lines.push(`  screenshot: ${shot}`)
				} finally {
					await page.close()
					// A block per scenario, so two workers never interleave half a failure message.
					console.log(lines.join('\n'))
				}
			}
		} finally {
			await context.close()
		}
	}

	try {
		await Promise.all(profiles(workers).map(runWorker))
	} finally {
		server.kill()
	}

	console.log(`\n${scenarios.length - failures.length}/${scenarios.length} scenarios passed`)
	if (failures.length) {
		process.exit(1)
	}
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
