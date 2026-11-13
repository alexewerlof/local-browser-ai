import assert from 'node:assert/strict'
import { deskExtraction, deskTab, exampleTab, localSettings, waitForPageCount, waitForRequests } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '36-remove-page'

/**
 * A page no turn has carried yet can be taken back: its block is in no request, so the
 * trash can in the page list removes it from the chat and from the next request. A page a
 * turn already carries is part of the transcript and keeps no trash can. Removing a page
 * also leaves its handle free rather than handing it to the next capture.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['Noted', '.'] })
	try {
		await ctx.open({ settings: localSettings(server.endpoint), tab: exampleTab })
		const { page } = ctx
		await waitForPageCount(page, 1)

		// A second page, so there is a choice of which one to take back.
		await page.evaluate(
			([nextTab, nextExtraction]) => window.__LB_AI_TEST__.addPage(nextTab, nextExtraction),
			[deskTab, deskExtraction],
		)
		await waitForPageCount(page, 2)
		assert.equal(await page.locator('.pages-menu__remove').count(), 2, 'both are removable')

		// Removing the first page leaves the second one, which is not the last row and does
		// not have to be: the handle of the removed page must not be handed out again.
		await page.locator('.pages-menu__remove').nth(0).click()
		await page.waitForFunction(() => document.querySelectorAll('.pages-menu__list > li').length === 1)
		assert.equal(await page.locator('.pages-menu__trigger .menu-item__count').textContent(), '1')
		assert.deepEqual(await page.locator('.page-chip__title').allTextContents(), ['Standing desk — Garden'])

		// The removed page is not in the request either: only p2 travels.
		await page.locator('.composer__input').fill('What does the desk cost?')
		await page.locator('[aria-label="Submit"]').click()
		await page.waitForFunction(() => document.querySelectorAll('.message--assistant').length === 1)

		const firstTurn = (await waitForRequests(server, 1)).messages.at(-1)
		assert.match(firstTurn.content, /## Page p2 — Standing desk — Garden/)
		// The title alone is no longer enough: the open-tab note names the tab beside the panel,
		// which is this very page. What must be absent is its block, and the note must say the
		// page is not in the chat, because the one copy of it was taken back.
		assert.doesNotMatch(firstTurn.content, /## Page p1 — Example Pricing/)
		assert.match(firstTurn.content, /\[Open tab: "Example Pricing" [^\]]* — not in this chat\]/)

		// The page that did reach the turn is part of the transcript now: no trash can.
		await page.waitForFunction(() => document.querySelectorAll('.pages-menu__item--pending').length === 0)
		assert.equal(await page.locator('.pages-menu__remove').count(), 0)

		// Adding a page again takes the next free handle, p3, not the removed p1 or the
		// live p2.
		await page.evaluate((nextTab) => window.__LB_AI_TEST__.addPage(nextTab), exampleTab)
		await waitForPageCount(page, 2)
		await page.locator('.composer__input').fill('And the starter plan?')
		await page.locator('[aria-label="Submit"]').click()
		await page.waitForFunction(() => document.querySelectorAll('.message--assistant').length === 2)

		const secondTurn = (await waitForRequests(server, 2)).messages.at(-1)
		assert.match(secondTurn.content, /## Page p3 — Example Pricing/)
		assert.doesNotMatch(secondTurn.content, /## Page p2 — Example Pricing/)
		// The page that was added again is the chat's now, so the note points at its handle.
		assert.match(secondTurn.content, /\[Open tab: "Example Pricing" [^\]]* — in this chat as p3\]/)
	} finally {
		await server.close()
	}
}
