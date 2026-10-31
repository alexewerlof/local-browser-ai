import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const CACHE_DIR = join(homedir(), '.cache', 'ms-playwright')

/** Finds the newest Playwright-managed Chromium that is already downloaded. */
function defaultExecutablePath() {
	if (!existsSync(CACHE_DIR)) {
		throw new Error(`No Playwright browser cache at ${CACHE_DIR}. Set PLAYWRIGHT_CHROMIUM_PATH.`)
	}
	const revisions = readdirSync(CACHE_DIR)
		.filter((name) => /^chromium-\d+$/.test(name))
		.sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]))

	for (const revision of revisions.reverse()) {
		for (const relative of [
			'chrome-linux64/chrome',
			'chrome-linux/chrome',
			'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
		]) {
			const candidate = join(CACHE_DIR, revision, relative)
			if (existsSync(candidate)) {
				return candidate
			}
		}
	}
	throw new Error(`No Chromium binary found in ${CACHE_DIR}. Set PLAYWRIGHT_CHROMIUM_PATH.`)
}

export function chromiumExecutablePath() {
	return process.env.PLAYWRIGHT_CHROMIUM_PATH ?? defaultExecutablePath()
}

export function launchBrowser() {
	return chromium.launch({
		executablePath: chromiumExecutablePath(),
		args: ['--no-sandbox'],
	})
}
