import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '08-options-persist'

export async function run(ctx) {
	const settings = localSettings('http://127.0.0.1:1/v1')
	await ctx.openOptions({ settings })
	const { page } = ctx

	await page.locator('.options__nav-item:has-text("General")').click()
	await page.waitForSelector('.options__content >> text=Appearance')

	// Change the theme and verify both the DOM and the persisted settings.
	await page.locator('select').first().selectOption('dark')
	await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
	// Settings are persisted with a short debounce; wait for the write, not just the render.
	// (waitForFunction needs a synchronous predicate, hence `currentSettings`.)
	await page.waitForFunction(() => window.__LB_AI_TEST__.currentSettings()?.ui?.theme === 'dark')

	const stored = await page.evaluate(() => window.__LB_AI_TEST__.readSettings())
	assert.equal(stored.ui.theme, 'dark')

	// Reload: settings come back from the shim's storage.
	await page.reload()
	await page.waitForSelector('.options')
	assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')

	await page.locator('.options__nav-item:has-text("Providers")').click()
	await page.waitForSelector('.provider')
	// The built-in provider is always present; the configured one must survive too.
	const providers = await page.locator('.rows').textContent()
	assert.match(providers, /Fake local server/)
	assert.match(providers, /Built-in browser model/)
}
