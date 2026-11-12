import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '26-settings-single-tab'

/**
 * Settings is one tab. A gear focuses the tab that is already open and moves it to its
 * section instead of stacking another copy, and the header gear keeps the section on screen.
 */
export async function run(ctx) {
	await ctx.open({ settings: localSettings('http://127.0.0.1:1/v1'), openTabs: ['settings.html'] })
	const { page } = ctx

	const opened = () => page.evaluate(() => window.__LB_AI_TEST__.opened.length)
	const updates = () => page.evaluate(() => window.__LB_AI_TEST__.updatedTabs)

	// Templates: the open tab is activated, focused and pointed at its section — no new tab.
	await page.locator('.chip:has-text("Templates")').click()
	await page.locator('button[aria-label="Manage templates"]').click()
	await page.waitForFunction(() => window.__LB_AI_TEST__.updatedTabs.length === 1)
	assert.equal(await opened(), 0)
	let last = (await updates()).at(-1)
	assert.equal(last.id, 500)
	assert.equal(last.active, true)
	assert.match(String(last.url), /\/settings\.html#templates$/)
	assert.deepEqual(await page.evaluate(() => window.__LB_AI_TEST__.focusedWindows), [{ id: 2, focused: true }])

	// Asking for the section already on screen only activates the tab; it does not reload it.
	await page.locator('.chip:has-text("Templates")').click()
	await page.locator('button[aria-label="Manage templates"]').click()
	await page.waitForFunction(() => window.__LB_AI_TEST__.updatedTabs.length === 2)
	last = (await updates()).at(-1)
	assert.equal(last.url, undefined)
	assert.equal(last.active, true)
	assert.equal(await opened(), 0)

	// A different section navigates the same tab.
	await page.locator('.chip:has-text("Tools")').click()
	await page.locator('button[aria-label="Manage tools"]').click()
	await page.waitForFunction(() => window.__LB_AI_TEST__.updatedTabs.length === 3)
	last = (await updates()).at(-1)
	assert.match(String(last.url), /\/settings\.html#tools$/)
	assert.equal(await opened(), 0)

	// The header gear passes no section, so the tab keeps the one the user was reading.
	await page.locator('button[aria-label="Settings"]').click()
	await page.waitForFunction(() => window.__LB_AI_TEST__.updatedTabs.length === 4)
	last = (await updates()).at(-1)
	assert.equal(last.url, undefined)
	assert.equal(await opened(), 0)
}
