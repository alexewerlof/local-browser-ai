import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '31-platform-settings'

/**
 * Chrome keeps this extension's shortcuts, updates and site permissions on its own pages, which no
 * extension can reproduce. The rail links to two of them — as the last rows of the menu, under a
 * divider, not in a pinned footer — so neither is a section and neither has a hash route.
 */
export async function run(ctx) {
	await ctx.openSettings({ settings: localSettings('http://127.0.0.1:1/v1') })
	const { page } = ctx

	assert.equal(await page.locator('.settings__nav-item').count(), 7)
	assert.equal(await page.locator('.settings__nav-item--active').textContent(), 'General')

	// The two leaving rows are the last items of the menu, right after the divider. The rail is
	// brand + seven sections + divider + two rows, so the divider is third from the end.
	assert.equal(await page.locator('.settings__nav-action').count(), 2)
	assert.equal(await page.locator('.settings__nav > :nth-last-child(3)').getAttribute('class'), 'settings__divider')

	const platform = page.locator('.settings__nav-action', { hasText: 'Platform Settings' })
	const privacy = page.locator('.settings__nav-action', { hasText: 'Privacy and security' })
	assert.equal(await platform.count(), 1)
	assert.equal(await privacy.count(), 1)
	assert.equal(await platform.textContent(), 'Platform Settings…')
	assert.equal(await privacy.textContent(), 'Privacy and security…')
	assert.equal(await platform.getAttribute('title'), 'Platform Settings…')
	assert.equal(await privacy.getAttribute('title'), 'Privacy and security…')
	// The harness supplies `chrome.runtime.id`, so both rows are live here.
	assert.equal(await platform.isDisabled(), false)
	assert.equal(await privacy.isDisabled(), false)

	// The panel-sized window collapses the rail to icons: the labels go, and with them the trailing
	// external-link glyph. Each row keeps its own leading icon either way.
	assert.equal(await platform.locator('.settings__nav-label').isVisible(), false)
	assert.equal(await platform.locator('.settings__nav-icon--trailing').isVisible(), false)
	assert.equal(await platform.locator('svg').first().isVisible(), true)
	await page.setViewportSize({ width: 1100, height: 900 })
	assert.equal(await platform.locator('.settings__nav-label').isVisible(), true)
	assert.equal(await platform.locator('.settings__nav-icon--trailing').isVisible(), true)
	// The external-link glyph trails the label, at the far edge of the row.
	const rowBox = await platform.boundingBox()
	const linkBox = await platform.locator('.settings__nav-icon--trailing').boundingBox()
	assert.ok(linkBox.x > rowBox.x + rowBox.width / 2, 'the external-link glyph is not trailing the label')
	await platform.click()
	await page.waitForFunction(() => window.__LB_AI_TEST__.opened.some((url) => url.startsWith('chrome://extensions/')))
	assert.equal(await page.evaluate(() => window.__LB_AI_TEST__.opened.at(-1)), 'chrome://extensions/?id=harness')

	await privacy.click()
	await page.waitForFunction(() =>
		window.__LB_AI_TEST__.opened.some((url) => url.startsWith('chrome://settings/content/siteDetails')),
	)
	assert.equal(
		await page.evaluate(() => window.__LB_AI_TEST__.opened.at(-1)),
		'chrome://settings/content/siteDetails?site=chrome-extension://harness',
	)
	await page.setViewportSize({ width: 520, height: 1100 })

	// Opening Chrome's pages leaves Settings where it was.
	assert.equal(await page.evaluate(() => window.location.hash), '')
	assert.equal(await page.locator('.settings__nav-item--active').textContent(), 'General')
}
