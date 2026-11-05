import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
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
		 * `hash` is the fragment to load, e.g. `'#/skills'`.
		 */
		async openOptions(config, hash = '') {
			await page.addInitScript(chromeShim, config ?? {})
			await page.goto(`${BASE_URL}/options.html${hash}`)
			await page.waitForSelector('.options', { timeout: 15000 })
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

	const server = await startServer()
	if (process.env.E2E_FRESH_PROFILE) {
		await rm(PROFILE, { recursive: true, force: true })
	}
	const context = await chromium.launchPersistentContext(PROFILE, {
		executablePath: chromiumExecutablePath(),
		headless: true,
		args: ['--no-sandbox'],
	})

	const scenarios = await loadScenarios(filter)
	const failures = []

	for (const scenario of scenarios) {
		const name = scenario.name ?? scenario.file.replace('.mjs', '')
		const page = await context.newPage()
		await page.setViewportSize({ width: 520, height: 1100 })
		const ctx = createContext(page, name)
		const started = Date.now()
		try {
			await withTimeout(scenario.run(ctx), SCENARIO_TIMEOUT_MS, name)
			await ctx.clean()
			console.log(`✔ ${name} (${Date.now() - started} ms)`)
		} catch (error) {
			failures.push({ name, error })
			const shot = await ctx.shot('failure').catch(() => null)
			console.log(`✖ ${name} (${Date.now() - started} ms)`)
			console.log(`  ${String(error.message).split('\n').join('\n  ')}`)
			if (shot) {
				console.log(`  screenshot: ${shot}`)
			}
		} finally {
			await page.close()
		}
	}

	await context.close()
	server.kill()

	console.log(`\n${scenarios.length - failures.length}/${scenarios.length} scenarios passed`)
	if (failures.length) {
		process.exit(1)
	}
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
