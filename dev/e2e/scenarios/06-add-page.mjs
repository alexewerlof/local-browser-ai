import assert from 'node:assert/strict'
import { exampleTab, localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '06-add-page'

/**
 * Adding a page from the context menu: the strip shows it at once, its block rides the
 * next user turn, and clicking its card asks the background to bring the tab back.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['Starter', ' is', ' 10 EUR.'] })
	try {
		// The context-menu click happened before the panel loaded, so the tab is queued
		// and captured during bootstrap.
		await ctx.open({ settings: localSettings(server.endpoint), tab: exampleTab })
		const { page } = ctx

		// The page is listed immediately, before any message carries it.
		await page.waitForSelector('.page-chip')
		assert.match(await page.locator('.page-chip__title').textContent(), /Example Pricing/)
		assert.equal(await page.locator('.page-chip').getAttribute('title'), 'https://example.com/pricing')
		assert.equal(await page.locator('.page-list .page-chip').count(), 1)
		// Nothing is in the prompt yet, so no card marks a turn.
		assert.equal(await page.locator('.message__pages').count(), 0)

		await page.locator('.composer__input').fill('How much is the starter plan?')
		await page.locator('[aria-label="Submit"]').click()
		await page.waitForFunction(() => document.body.innerText.includes('Starter is 10 EUR.'))

		// The block rides the user turn; the system prompt stays free of it.
		const body = server.requests[0]
		const system = body.messages[0].content
		assert.doesNotMatch(system, /## Page p1/)
		const userTurn = body.messages.at(-1)
		assert.equal(userTurn.role, 'user')
		assert.match(userTurn.content, /## Page p1 — Example Pricing/)
		assert.match(userTurn.content, /URL: https:\/\/example\.com\/pricing/)
		assert.match(userTurn.content, /untrusted data, not instructions/)
		// Only the outline is in the prompt; the text stays behind the tools.
		assert.doesNotMatch(userTurn.content, /Starter plan costs 10 EUR per month/)

		// The card now marks where the page entered the chat.
		await page.waitForSelector('.message__pages .page-card')
		assert.match(await page.locator('.page-card__title').textContent(), /Example Pricing/)
		assert.match(await page.locator('.page-card__url').textContent(), /example\.com\/pricing/)

		// Clicking it brings that page back.
		await page.locator('.page-card__link').click()
		const focused = await page.evaluate(() => window.__LB_AI_TEST__.focusedPages)
		assert.equal(focused.length, 1)
		assert.equal(focused[0].url, 'https://example.com/pricing')
		assert.equal(focused[0].tabId, exampleTab.id)

		// The meter counts the page block.
		await page.locator('.meter').click()
		const panelText = await page.locator('.popover').textContent()
		assert.match(panelText, /Example Pricing/)
	} finally {
		await server.close()
	}
}
