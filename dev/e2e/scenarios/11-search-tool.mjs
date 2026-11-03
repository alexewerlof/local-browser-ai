import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '11-search-tool'

/** The model searches the web through the user's default engine (chrome.search). */
export async function run(ctx) {
	const server = await startFakeModelServer({
		chunks: ['I opened the results in a new tab.'],
		toolScript: (_body, index) => (index === 0 ? 'tool-call' : 'text'),
		toolCall: {
			name: 'search_web',
			arguments: JSON.stringify({ query: 'chrome mv3 search api' }),
		},
	})
	try {
		await ctx.open({
			settings: localSettings(server.endpoint, {
				model: 'llama-3.2-3b-instruct',
				// Only the search tool, so the recorded call is unambiguous.
				tools: { enabled: ['search_web'], autoApprove: ['search_web'] },
			}),
		})
		const { page } = ctx

		await page.locator('.composer__input').fill('Look up the Chrome search API')
		await page.locator('button[aria-label="Submit"]').click()

		await page.waitForSelector('.tool')
		assert.match(await page.locator('.tool__name').textContent(), /Searching the web/)

		await page.waitForFunction(() => document.body.innerText.includes('I opened the results in a new tab.'))
		assert.equal(await page.locator('.tool__head .badge').textContent(), 'complete')

		// The query ran through the default search engine, in a new tab unless the model
		// asked for something else.
		const searches = await page.evaluate(() => window.__LB_AI_TEST__.searches)
		assert.deepEqual(searches, [{ text: 'chrome mv3 search api', disposition: 'NEW_TAB' }])

		// The result tells the model it cannot read the results tab, so it does not
		// pretend to have seen them.
		assert.equal(server.requests.length, 2)
		const toolMessage = server.requests[1].messages.find((message) => message.role === 'tool')
		assert.ok(toolMessage, 'the search result should be sent back to the model')
		const content =
			typeof toolMessage.content === 'string' ? toolMessage.content : JSON.stringify(toolMessage.content)
		const result = JSON.parse(content)
		assert.equal(result.searched, true)
		assert.equal(result.query, 'chrome mv3 search api')
		assert.equal(result.disposition, 'NEW_TAB')
		assert.match(result.note, /cannot read/)
	} finally {
		await server.close()
	}
}
