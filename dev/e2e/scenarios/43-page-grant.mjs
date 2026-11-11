import assert from 'node:assert/strict'
import { localSettings, waitForPageCount } from '../fixtures.mjs'

export const name = '43-page-grant'

/**
 * The composer's add button asks before it asks Chrome.
 *
 * A site grant is permanent for every later chat, so pressing "+" opens a box naming both
 * routes — Continue for the permanent grant, the context menu or the toolbar button for
 * this page only — and only Continue raises Chrome's dialog. What the user answers in that
 * dialog ends the box either way, and a site that is already granted skips it completely.
 */
export async function run(ctx) {
	await ctx.open({ settings: localSettings('http://localhost:1/v1'), hostAccess: 'ask' })
	const { page } = ctx
	const add = page.locator('.composer__add-page')
	const box = page.locator('.page-access')

	// 1. The add opens the box and adds nothing: Chrome has not been asked yet.
	await add.click()
	await box.waitFor()
	const copy = await box.textContent()
	// The box names the site the grant would cover, so the permanence is not a surprise.
	assert.match(copy, /read and change your data on example\.com/)
	assert.match(copy, /Add to chat/)
	assert.equal(await page.locator('.page-list__toggle').count(), 0)
	assert.deepEqual(await page.evaluate(() => window.__LB_AI_TEST__.hostAccessRequests), [])

	// 2. Cancel closes it and leaves the chat alone. The user may still add the page from
	//    the context menu or the toolbar button.
	await box.locator('button', { hasText: 'Cancel' }).click()
	assert.equal(await page.locator('.page-access').count(), 0)
	assert.equal(await page.locator('.page-list__toggle').count(), 0)

	// 2b. The X is the same decision as Cancel, so it does the same nothing.
	await add.click()
	await box.locator('button[aria-label="Dismiss the page request"]').click()
	assert.equal(await page.locator('.page-access').count(), 0)
	assert.equal(await page.locator('.page-list__toggle').count(), 0)

	// 3. A refused dialog ends the box too: there is no page to show and nothing left to
	//    retry, so the box must not linger.
	await page.evaluate(() => window.__LB_AI_TEST__.setHostAccess('deny'))
	await add.click()
	await box.locator('button', { hasText: 'Continue' }).click()
	await page.waitForFunction(() => document.querySelectorAll('.page-access').length === 0)
	assert.equal(await page.locator('.page-list__toggle').count(), 0)
	assert.equal(await page.locator('.composer__error').count(), 0)

	// 4. An allowed dialog adds the page, and the add opens the list so it can be undone.
	await page.evaluate(() => window.__LB_AI_TEST__.setHostAccess('ask'))
	await add.click()
	await box.locator('button', { hasText: 'Continue' }).click()
	await waitForPageCount(page, 1)
	assert.equal(await page.locator('.page-access').count(), 0)
	await page.waitForSelector('.page-list__panel')
	assert.match(await page.locator('.page-chip__title').textContent(), /Example Pricing/)

	// 5. Nothing to decide once the site is granted: no box, just the page.
	await page.evaluate(() => window.__LB_AI_TEST__.setHostAccess('granted'))
	await add.click()
	await waitForPageCount(page, 2)
	assert.equal(await page.locator('.page-access').count(), 0)
}
