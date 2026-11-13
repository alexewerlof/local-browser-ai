import assert from 'node:assert/strict'
import { expandSteps, localSettings } from '../fixtures.mjs'
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
				// Search plus one page tool: the results tab becomes a page in the chat, and a
				// page nobody can read is refused.
				tools: {
					enabled: ['search_web', 'read_page'],
					autoApprove: ['search_web', 'read_page'],
				},
			}),
		})
		const { page } = ctx

		await page.locator('.composer__input').fill('Look up the Chrome search API')
		await page.locator('button[aria-label="Submit"]').click()

		await page.waitForFunction(() => document.body.innerText.includes('I opened the results in a new tab.'))
		await expandSteps(page)
		assert.match(await page.locator('.tool__name').textContent(), /Searching the web/)
		assert.equal(await page.locator('.tool[data-state="complete"]').count(), 1)

		// The query ran through the default search engine, in a new tab unless the model
		// asked for something else. The chat id rides along so only this chat's own
		// results tab is ever reused.
		const searches = await page.evaluate(() => window.__LB_AI_TEST__.searches)
		assert.deepEqual(
			searches.map(({ text, disposition }) => ({ text, disposition })),
			[{ text: 'chrome mv3 search api', disposition: 'NEW_TAB' }],
		)
		assert.ok(searches[0].conversationId, 'a search names the chat that asked for it')

		// The result carries the captured results, so the model answers from the page
		// instead of telling the user to add the tab itself.
		assert.equal(server.requests.length, 2)
		const toolMessage = server.requests[1].messages.find((message) => message.role === 'tool')
		assert.ok(toolMessage, 'the search result should be sent back to the model')
		const content =
			typeof toolMessage.content === 'string' ? toolMessage.content : JSON.stringify(toolMessage.content)
		const result = JSON.parse(content)
		assert.equal(result.searched, true, JSON.stringify(result))
		assert.equal(result.query, 'chrome mv3 search api')
		assert.equal(result.added, true, JSON.stringify(result))
		assert.equal(result.page, 'p1', JSON.stringify(result))
		assert.ok(result.text.length > 0, 'the captured results should come back with the call')

		// The results page is in the chat for the model to read (`result.added` above), but a
		// search is the extension doing its job, not a reference: nothing is listed.
		assert.equal(await page.locator('.pages-menu__trigger .menu-item__count').textContent(), '0')
		assert.equal(await page.locator('.page-chip').count(), 0)
		// The tool attached it itself, so the card no longer offers to add it again.
		assert.equal(await page.locator('.tool__action').count(), 0)
	} finally {
		await server.close()
	}
}
