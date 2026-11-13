import assert from 'node:assert/strict'
import { localSettings, waitForPageCount } from '../fixtures.mjs'

export const name = '43-page-grant'

/**
 * The composer's add button asks before it asks Chrome.
 *
 * A site grant is permanent for every later chat, so pressing “+” in the Pages menu opens a
 * box naming both routes — Continue for the permanent grant, the context menu or the toolbar
 * button for this page only — and only Continue raises Chrome's dialog. What the user answers
 * in that dialog ends the box either way, and a site that is already granted skips it
 * completely. The menu closes as the add starts, because the box asks above the composer and
 * a floating menu would cover it; the page that lands reopens it.
 */
export async function run(ctx) {
	await ctx.open({ settings: localSettings('http://localhost:1/v1'), hostAccess: 'ask' })
	const { page } = ctx
	const trigger = page.locator('.pages-menu__trigger')
	const box = page.locator('.page-access')

	/** The count on the bar, which is on screen whether the menu is open or closed. */
	const pageCount = () => page.locator('.pages-menu__trigger .menu-item__count').textContent()

	/** Open the menu if it is closed, then press its add. */
	const pressAdd = async () => {
		if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
		await page.waitForSelector('.pages-menu__add')
		await page.locator('.pages-menu__add').click()
	}

	// 0. The add is the menu's one trailing button, where the other menus keep their gear.
	await trigger.click()
	await page.waitForSelector('.pages-menu__add')
	assert.equal(await page.locator('.pages-menu__add').getAttribute('aria-label'), 'Add page to chat')
	assert.equal(await page.locator('.popover__header .button').count(), 1)
	await page.keyboard.press('Escape')

	// 1. The add opens the box and adds nothing: Chrome has not been asked yet.
	await pressAdd()
	await box.waitFor()
	// Pressing it closed the menu, so the box is not covered.
	assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
	const copy = await box.textContent()
	// The box names the site the grant would cover, so the permanence is not a surprise.
	assert.match(copy, /read and change your data on example\.com/)
	assert.match(copy, /Add to chat/)
	assert.equal(await pageCount(), '0')
	assert.deepEqual(await page.evaluate(() => window.__LB_AI_TEST__.hostAccessRequests), [])

	// 2. Cancel closes it and leaves the chat alone. The user may still add the page from
	//    the context menu or the toolbar button.
	await box.locator('button', { hasText: 'Cancel' }).click()
	assert.equal(await page.locator('.page-access').count(), 0)
	assert.equal(await pageCount(), '0')

	// 2b. The X is the same decision as Cancel, so it does the same nothing.
	await pressAdd()
	await box.locator('button[aria-label="Dismiss the page request"]').click()
	assert.equal(await page.locator('.page-access').count(), 0)
	assert.equal(await pageCount(), '0')

	// 3. A refused dialog ends the box too: there is no page to show and nothing left to
	//    retry, so the box must not linger.
	await page.evaluate(() => window.__LB_AI_TEST__.setHostAccess('deny'))
	await pressAdd()
	await box.locator('button', { hasText: 'Continue' }).click()
	await page.waitForFunction(() => document.querySelectorAll('.page-access').length === 0)
	assert.equal(await pageCount(), '0')
	assert.equal(await page.locator('.composer__error').count(), 0)

	// 4. An allowed dialog adds the page, and the add reopens the menu on the new row so it
	//    can be undone.
	await page.evaluate(() => window.__LB_AI_TEST__.setHostAccess('ask'))
	await pressAdd()
	await box.locator('button', { hasText: 'Continue' }).click()
	await waitForPageCount(page, 1)
	assert.equal(await page.locator('.page-access').count(), 0)
	await page.waitForSelector('.pages-menu__list')
	assert.match(await page.locator('.page-chip__title').textContent(), /Example Pricing/)

	// 5. Nothing to decide once the site is granted: no box, just the page.
	await page.evaluate(() => window.__LB_AI_TEST__.setHostAccess('granted'))
	await pressAdd()
	await waitForPageCount(page, 2)
	assert.equal(await page.locator('.page-access').count(), 0)
}
