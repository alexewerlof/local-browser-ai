import assert from 'node:assert/strict'
import { deskExtraction, deskTab, exampleTab, localSettings, waitForPageCount } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '27-multi-page'

/**
 * Two pages in one chat: both blocks travel in the turn that added the second one, and
 * each card brings its own page back.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['Both', ' desks', ' are', ' similar', '.'] })
	try {
		await ctx.open({ settings: localSettings(server.endpoint), tab: exampleTab })
		const { page } = ctx

		await waitForPageCount(page, 1)
		assert.equal(await page.locator('.page-list__count').textContent(), '1')

		// The second page arrives from another tab, while the panel is open.
		await page.evaluate(
			([nextTab, nextExtraction]) => window.__LB_AI_TEST__.addPage(nextTab, nextExtraction),
			[deskTab, deskExtraction],
		)
		// Two pages collapse into the count: the chips only exist once the list is open.
		// Adding a page opens the list by itself, so both are on screen without a click.
		await waitForPageCount(page, 2)
		assert.equal(await page.locator('.page-list__panel > li').count(), 2)
		// Both captures are done, so the count is not animating any more.
		assert.equal(await page.locator('.page-list__capturing').count(), 0)

		const titles = await page.locator('.page-chip__title').allTextContents()
		assert.deepEqual(titles, ['Example Pricing', 'Standing desk — Garden'])

		await page.locator('.composer__input').fill('Which one is cheaper?')
		await page.locator('[aria-label="Submit"]').click()
		await page.waitForFunction(() => document.body.innerText.includes('Both desks are similar.'))

		// A completed turn is not work in progress, so the count stays still.
		assert.equal(await page.locator('.page-list__capturing').count(), 0)

		// Both blocks are in the same user turn, each with its own handle.
		const body = server.requests[0]
		const userTurn = body.messages.at(-1)
		assert.match(userTurn.content, /## Page p1 — Example Pricing/)
		assert.match(userTurn.content, /## Page p2 — Standing desk — Garden/)
		assert.match(userTurn.content, /URL: https:\/\/garden\.example\/desk/)
		assert.match(userTurn.content, /Which one is cheaper\?/)

		// Both cards are in the transcript, in order.
		await page.waitForSelector('.message__pages .page-card')
		assert.equal(await page.locator('.message__pages .page-card').count(), 2)

		// Each card focuses its own page.
		await page.locator('.message__pages .page-card__link').nth(1).click()
		await page.locator('.message__pages .page-card__link').nth(0).click()
		const focused = await page.evaluate(() => window.__LB_AI_TEST__.focusedPages)
		assert.deepEqual(
			focused.map((entry) => entry.url),
			['https://garden.example/desk', 'https://example.com/pricing'],
		)
		assert.deepEqual(
			focused.map((entry) => entry.tabId),
			[deskTab.id, exampleTab.id],
		)
	} finally {
		await server.close()
	}
}
