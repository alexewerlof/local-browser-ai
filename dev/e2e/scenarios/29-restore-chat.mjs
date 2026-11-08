import assert from 'node:assert/strict'
import { deskExtraction, deskTab, exampleTab, localSettings, togglePageList, waitForPageCount } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '29-restore-chat'

/**
 * The side panel is destroyed when it closes, so a reopened one has to put itself back
 * together: the chat that was on screen, the pages that chat holds and its queue.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['Ten', ' euros', ' a', ' month', '.'] })
	// The harness profile is reused between runs, so the chat needs a unique title.
	const title = `Restore ${Date.now()}`
	try {
		await ctx.open({ settings: localSettings(server.endpoint) })
		const { page } = ctx

		// The pages are added while the panel is open, so the reload below has nothing
		// queued to deliver: what comes back is what the chat stored, not a re-extraction.
		await page.evaluate((nextTab) => window.__LB_AI_TEST__.addPage(nextTab), exampleTab)
		await waitForPageCount(page, 1)
		await page.locator('.composer__input').fill(title)
		await page.locator('[aria-label="Submit"]').click()
		await page.waitForFunction(() => document.body.innerText.includes('Ten euros a month.'))

		// A second page, added after the first turn so it is still waiting for one.
		await page.evaluate(
			([nextTab, nextExtraction]) => window.__LB_AI_TEST__.addPage(nextTab, nextExtraction),
			[deskTab, deskExtraction],
		)
		await waitForPageCount(page, 2)

		await page.reload()
		await page.waitForSelector('.composer__input')

		// Same chat, same transcript.
		assert.equal(await page.locator('.header__title').textContent(), title)
		assert.equal(await page.locator('.message--user').count(), 1)
		assert.equal(await page.locator('.message--assistant').count(), 1)

		// Same pages: the strip comes back collapsed, with one still waiting for a turn.
		assert.equal(await page.locator('.page-list__toggle').textContent(), '2')
		assert.equal(await page.locator('.page-chip').count(), 0)
		// Restoring reads the store; nothing is being converted, so nothing animates.
		assert.equal(await page.locator('.page-list__capturing').count(), 0)

		await togglePageList(page)
		// The one that already reached a turn is still marked as sent.
		assert.equal(await page.locator('.page-chip').count(), 2)
		assert.equal(await page.locator('.page-list__item--pending').count(), 1)
		assert.deepEqual(await page.locator('.page-chip__title').allTextContents(), [
			'Example Pricing',
			'Standing desk — Garden',
		])

		// The restored transcript is what the model sees: the first turn still carries the
		// first page's frozen block, and the waiting page joins the new turn.
		await page.locator('.composer__input').fill('And what does the desk cost?')
		await page.locator('[aria-label="Submit"]').click()
		await page.waitForFunction(() => document.querySelectorAll('.message--user').length === 2)

		const second = server.requests.at(-1)
		const carried = second.messages.map((message) => message.content ?? '').join('\n')
		assert.match(second.messages.at(-1).content, /## Page p2 — Standing desk — Garden/)
		assert.match(second.messages.at(-1).content, /And what does the desk cost\?/)
		assert.match(carried, /## Page p1 — Example Pricing/)
	} finally {
		await server.close()
	}
}
