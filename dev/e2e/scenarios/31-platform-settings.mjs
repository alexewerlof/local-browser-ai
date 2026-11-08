import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '31-platform-settings'

/**
 * Chrome keeps the extension's keyboard shortcuts, site access and update controls on its own
 * Extensions page, which no extension can reproduce. The rail footer points at it instead — and
 * it is a footer, not a ninth section, so the eight sections and their hash routes are untouched.
 */
export async function run(ctx) {
	await ctx.openSettings({ settings: localSettings('http://127.0.0.1:1/v1') })
	const { page } = ctx

	assert.equal(await page.locator('.settings__nav-item').count(), 9)
	assert.equal(await page.locator('.settings__nav-item--active').textContent(), 'General')

	// The action is last in the rail, after every section.
	assert.equal(await page.locator('.settings__nav > :last-child').getAttribute('class'), 'settings__footer')
	const action = page.locator('.settings__nav-action')
	assert.equal(await action.textContent(), 'Platform Settings…')
	assert.equal(await action.getAttribute('title'), 'Platform Settings…')
	// The harness supplies `chrome.runtime.id`, so the action is live here.
	assert.equal(await action.isDisabled(), false)

	// The panel-sized window collapses the rail to icons, so the hint goes with the labels.
	assert.equal(await page.locator('.settings__footer-hint').isVisible(), false)
	assert.equal(await action.locator('.settings__nav-label').isVisible(), false)
	await page.setViewportSize({ width: 1100, height: 900 })
	assert.equal(await page.locator('.settings__footer-hint').isVisible(), true)
	assert.equal(await action.locator('.settings__nav-label').isVisible(), true)
	await page.setViewportSize({ width: 520, height: 1100 })

	await action.click()
	await page.waitForFunction(() => window.__LB_AI_TEST__.opened.some((url) => url.startsWith('chrome://extensions/')))
	assert.equal(await page.evaluate(() => window.__LB_AI_TEST__.opened.at(-1)), 'chrome://extensions/?id=harness')

	// Opening Chrome's page leaves Settings where it was.
	assert.equal(await page.evaluate(() => window.location.hash), '')
	assert.equal(await page.locator('.settings__nav-item--active').textContent(), 'General')
}
