import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '44-tool-manual-add'

/**
 * The recommended answer to a parked tool is the browser's own UI.
 *
 * A search leaves its tool call open until the model may read the results. The box offers
 * the permanent grant, and names the other route: add the page from the context menu (or
 * the toolbar button), which carries `activeTab` and needs no site permission at all. That
 * route has to finish the waiting call — otherwise the model is parked behind a question
 * the user answered somewhere else, and the run never resumes.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({
		chunks: ['The results say ', '`chrome.search` opens a tab.'],
		toolScript: (_body, index) => (index < 1 ? 'tool-call' : 'text'),
		toolCall: () => ({ name: 'search_web', arguments: JSON.stringify({ query: 'chrome mv3 search api' }) }),
	})
	try {
		await ctx.open({
			settings: localSettings(server.endpoint, {
				model: 'llama-3.2-3b-instruct',
				// The page tools have to be on: a page nobody can read is not worth asking a
				// site for, and `attachTab` refuses before it offers the chip.
				tools: { enabled: ['search_web', 'read_page'], autoApprove: ['search_web'] },
			}),
			hostAccess: 'ask',
		})
		const { page } = ctx

		await page.locator('.composer__input').fill('Look up the Chrome search API')
		await page.locator('button[aria-label="Submit"]').click()

		await page.waitForSelector('.tool--running')
		const box = page.locator('.page-access')
		await box.waitFor()
		const copy = await box.textContent()
		assert.match(copy, /search results are on www\.google\.com/)
		// A search is the one grant worth keeping: its permanent route is the primary action.
		assert.equal(await box.locator('button.button--primary').textContent(), 'Continue')

		// The model has not been called again while the user decides.
		await page.waitForTimeout(400)
		assert.equal(server.requests.length, 1, 'the run must wait for the access decision')

		const resultsTab = await page.evaluate(() => window.__LB_AI_TEST__.hostAccessRequests[0])
		assert.ok(typeof resultsTab === 'number', 'the chip belongs to the results tab')
		assert.notEqual(resultsTab, 42)

		// The user answers from the browser instead: "Add to chat" on the results tab.
		await page.evaluate((tabId) => {
			const url = 'https://www.google.com/search?q=chrome+mv3+search+api'
			window.__LB_AI_TEST__.addPage(
				{ id: tabId, url, title: 'chrome mv3 search api - Search' },
				{
					url,
					baseUrl: 'https://www.google.com/',
					canonicalUrl: url,
					title: 'chrome mv3 search api - Search',
					description: '',
					lang: 'en',
					faviconUrl: '',
					byline: '',
					publishedTime: '',
					selection: '',
					truncated: false,
					text: 'chrome.search.query opens the default search engine.',
					aria: '',
					controls: 0,
					html: [
						'<html><head><title>chrome mv3 search api - Search</title></head><body><article>',
						'<h1>chrome mv3 search api - Search</h1>',
						'<p>chrome.search.query opens the default search engine.</p>',
						'</article></body></html>',
					].join(''),
				},
			)
		}, resultsTab)

		// The box goes, the chip is taken back, and the parked call finishes the run.
		await page.waitForFunction(() => document.body.innerText.includes('The results say'))
		assert.equal(await page.locator('.page-access').count(), 0)
		const removed = await page.evaluate(() => window.__LB_AI_TEST__.hostAccessRemoved)
		assert.deepEqual(removed, [resultsTab])

		const result = toolResult(server.requests[1])
		assert.equal(result.added, true, JSON.stringify(result))
		assert.equal(result.page, 'p1', JSON.stringify(result))
		assert.match(result.text, /chrome\.search/)

		// The page was captured as the results of a search, so it is not a reference the
		// user added: the Pages menu counts none.
		assert.equal(await page.locator('.pages-menu__trigger .menu-item__count').textContent(), '0')
		assert.equal(await page.locator('.page-chip').count(), 0)
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
