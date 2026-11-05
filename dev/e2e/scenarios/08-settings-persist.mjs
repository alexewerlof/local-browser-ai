import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '08-settings-persist'

export async function run(ctx) {
	const settings = localSettings('http://127.0.0.1:1/v1')
	await ctx.openSettings({ settings })
	const { page } = ctx

	await page.locator('.settings__nav-item:has-text("General")').click()
	await page.waitForSelector('.settings__content >> text=Appearance')

	// General leads the rail and is the default section; it hosts the tool-step cap.
	assert.equal(await page.locator('.settings__nav-item').first().textContent(), 'General')
	assert.equal(await page.locator('.settings__nav-item--active').textContent(), 'General')
	assert.equal(await page.locator('.settings__content >> text=Maximum tool steps per answer').count(), 1)

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
	await page.waitForSelector('.settings')
	assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')

	await page.locator('.settings__nav-item:has-text("Context")').click()
	await page.waitForSelector('.settings__content >> text=Compaction')
	// The tool-step cap now lives in General, not Context.
	assert.equal(await page.locator('.settings__content >> text=Maximum tool steps per answer').count(), 0)

	await page.locator('.settings__nav-item:has-text("Providers")').click()
	await page.waitForSelector('.provider')
	// The built-in provider is always present; the configured one must survive too.
	const providers = await page.locator('.rows').textContent()
	assert.match(providers, /Fake local server/)
	assert.match(providers, /Built-in browser model/)
}
