import assert from 'node:assert/strict'
import { expandSteps, localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '32-search-access'

/**
 * A search is not finished when Chrome opens a tab.
 *
 * The model cannot read the results until the user allows that site, so the tool call has
 * to stay open: if it returned "the results are in a tab you cannot read", the turn would
 * end and the model would answer before the user had even allowed anything. Here the run
 * waits, and the page it waited for is the page the model then reads.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({
		chunks: ['According to the results, ', 'the search API is `chrome.search`.'],
		toolScript: (_body, index) => (index < 2 ? 'tool-call' : 'text'),
		toolCall: (_body, index) =>
			index === 0
				? { name: 'search_web', arguments: JSON.stringify({ query: 'chrome mv3 search api' }) }
				: { name: 'read_page', arguments: JSON.stringify({ mode: 'outline' }) },
	})
	try {
		await ctx.open({
			settings: localSettings(server.endpoint, {
				model: 'llama-3.2-3b-instruct',
				tools: {
					enabled: ['search_web', 'read_page'],
					autoApprove: ['search_web'],
				},
			}),
			// Nothing is granted yet: the extension has to ask, and the user has to answer.
			hostAccess: 'ask',
		})
		const { page } = ctx

		await page.locator('.composer__input').fill('Look up the Chrome search API')
		await page.locator('button[aria-label="Submit"]').click()

		// The request for the site is on screen, and the tool call is still open.
		await page.waitForSelector('.tool--running')
		await page.waitForSelector('.page-access')
		const box = page.locator('.page-access')
		assert.match(await box.textContent(), /search results are on www\.google\.com/)
		// A search is the one grant worth keeping — the same engine is used by the next
		// question — so its permanent route is the primary action.
		assert.equal(await box.locator('button.button--primary').textContent(), 'Continue')

		// The whole point: the model has not been called again while the user decides.
		// A regression here is what makes the model give up on the page too early.
		await page.waitForTimeout(400)
		assert.equal(server.requests.length, 1, 'the run must wait for the access decision')

		// The chip was offered on the results tab, not on the page the user was reading.
		const requests = await page.evaluate(() => window.__LB_AI_TEST__.hostAccessRequests)
		assert.equal(requests.length, 1)
		assert.notEqual(requests[0], 42)

		// The results page gets its own extraction, so the answer can only come from it.
		await page.evaluate(() =>
			window.__LB_AI_TEST__.setExtraction({
				url: 'https://www.google.com/search?q=chrome+mv3+search+api',
				baseUrl: 'https://www.google.com/',
				canonicalUrl: 'https://www.google.com/search?q=chrome+mv3+search+api',
				title: 'chrome mv3 search api - Search',
				description: '',
				lang: 'en',
				faviconUrl: '',
				byline: '',
				publishedTime: '',
				selection: '',
				truncated: false,
				text: 'chrome.search.query opens the default search engine.',
				html: [
					'<html><head><title>chrome mv3 search api - Search</title></head><body><article>',
					'<h1>chrome mv3 search api - Search</h1>',
					'<h2>Using chrome.search</h2>',
					'<p>The search API hands the query to the default engine and opens a tab.</p>',
					'<h2>Manifest requirements</h2>',
					'<p>Declare the search permission in the manifest.</p>',
					'</article></body></html>',
				].join(''),
			}),
		)

		// Accepting the chip is what resumes the run.
		await page.evaluate(() => window.__LB_AI_TEST__.grantHostAccess('https://www.google.com/*'))

		await page.waitForFunction(() => document.body.innerText.includes('According to the results'))

		// The banner is gone and the page it waited for is in the chat, but a search is not a
		// reference: the Pages menu counts none.
		assert.equal(await page.locator('.page-access').count(), 0)
		assert.equal(await page.locator('.pages-menu__trigger .menu-item__count').textContent(), '0')
		assert.equal(await page.locator('.page-chip').count(), 0)
		// The search attached its own page, so opening the folded steps offers no manual add.
		await expandSteps(page)
		assert.equal(await page.locator('.tool__action').count(), 0)

		// The search result carries the page and its text, and the next step read that
		// exact page.
		assert.equal(server.requests.length, 3)
		const searchResult = toolResult(server.requests[1])
		assert.equal(searchResult.added, true)
		assert.equal(searchResult.page, 'p1')
		assert.match(searchResult.text, /chrome\.search/)

		const outline = toolResult(server.requests[2])
		const headings = JSON.stringify(outline)
		assert.match(headings, /Using chrome\.search/)
		assert.match(headings, /Manifest requirements/)
	} finally {
		await server.close()
	}
}

/** The newest tool message of a recorded request, parsed. */
function toolResult(body) {
	const messages = body.messages.filter((entry) => entry.role === 'tool')
	assert.ok(messages.length > 0, 'the tool result should be sent back to the model')
	const message = messages[messages.length - 1]
	const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
	return JSON.parse(content)
}
