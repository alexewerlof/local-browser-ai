import assert from 'node:assert/strict'
import { exampleTab, localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '27-multi-page'

const desk = {
	id: 43,
	windowId: 1,
	url: 'https://garden.example/desk',
	title: 'Standing desk — Garden',
	favIconUrl: '',
}

const deskExtraction = {
	url: desk.url,
	baseUrl: desk.url,
	canonicalUrl: desk.url,
	title: desk.title,
	description: 'A desk',
	lang: 'en',
	faviconUrl: '',
	byline: '',
	publishedTime: '',
	selection: '',
	truncated: false,
	text: 'The desk costs 1299 EUR and ships in April.',
	aria: '',
	controls: 0,
	html: [
		'<html><body><article>',
		'<h1>Standing desk</h1>',
		'<p>The desk costs 1299 EUR and ships in April.</p>',
		'<h2>Warranty</h2>',
		'<p>Ten years on the frame, three on the motor.</p>',
		'</article></body></html>',
	].join(''),
}

/**
 * Two pages in one chat: both blocks travel in the turn that added the second one, and
 * each card brings its own page back.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['Both', ' desks', ' are', ' similar', '.'] })
	try {
		await ctx.open({ settings: localSettings(server.endpoint), tab: exampleTab })
		const { page } = ctx

		await page.waitForSelector('.page-chip')
		assert.equal(await page.locator('.page-chip').count(), 1)

		// The second page arrives from another tab, while the panel is open.
		await page.evaluate(
			([nextTab, nextExtraction]) => window.__LB_AI_TEST__.addPage(nextTab, nextExtraction),
			[desk, deskExtraction],
		)
		await page.waitForFunction(() => document.querySelectorAll('.page-chip').length === 2)

		const titles = await page.locator('.page-chip__title').allTextContents()
		assert.deepEqual(titles, ['Example Pricing', 'Standing desk — Garden'])

		await page.locator('.composer__input').fill('Which one is cheaper?')
		await page.locator('[aria-label="Submit"]').click()
		await page.waitForFunction(() => document.body.innerText.includes('Both desks are similar.'))

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
			[desk.id, exampleTab.id],
		)
	} finally {
		await server.close()
	}
}
