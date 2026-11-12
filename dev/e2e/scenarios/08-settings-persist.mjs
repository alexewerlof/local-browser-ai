import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '08-settings-persist'

export async function run(ctx) {
	const settings = localSettings('http://127.0.0.1:1/v1')
	await ctx.openSettings({ settings })
	const { page } = ctx

	await page.locator('.settings__nav-item:has-text("General")').click()
	await page.waitForSelector('.settings__content >> text=Tool Calls')

	// General leads the rail, Appearance follows it, and General hosts the tool-step cap.
	assert.equal(await page.locator('.settings__nav-item').first().textContent(), 'General')
	assert.equal(await page.locator('.settings__nav-item').nth(1).textContent(), 'Appearance')
	assert.equal(await page.locator('.settings__nav-item--active').textContent(), 'General')
	assert.equal(await page.locator('.settings__content >> text=Maximum tool steps per answer').count(), 1)

	// The theme lives in Appearance; changing it still restyles the page and persists.
	await page.locator('.settings__nav-item:has-text("Appearance")').click()
	await page.waitForSelector('.settings__content >> text=Code highlighting')
	assert.equal(await page.locator('.settings__nav-item--active').textContent(), 'Appearance')
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
	// The tool-step cap stays in General and the system prompt moved here, above compaction.
	// Match the card title, not the section intro, which also mentions the system prompt.
	assert.equal(await page.locator('.settings__content >> text=Maximum tool steps per answer').count(), 0)
	assert.equal(await page.locator('.group__title', { hasText: 'System prompt' }).count(), 1)

	await page.locator('.settings__nav-item:has-text("Model Providers")').click()
	await page.waitForSelector('.provider')
	// Adding a provider is persisted; nothing else is seeded next to it.
	const providers = await page.locator('.rows').textContent()
	assert.match(providers, /Fake local server/)
	assert.equal(await page.locator('.provider').count(), 1)
}
