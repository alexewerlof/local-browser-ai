import assert from 'node:assert/strict'
import { exampleTab, localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '07-tool-call'

export async function run(ctx) {
	const server = await startFakeModelServer({
		chunks: ['Teams', ' costs', ' 25 EUR.'],
		// The first request asks for a tool; after the SDK supplies the result, the
		// second request gets a normal answer.
		toolScript: (body, index) => {
			if (index > 0) return 'text'
			return body.messages.some((message) => message.role === 'tool') ? 'text' : 'tool-call'
		},
		toolCall: { name: 'read_page', arguments: JSON.stringify({ mode: 'find', query: 'Teams' }) },
	})
	try {
		await ctx.open({
			settings: localSettings(server.endpoint, { model: 'llama-3.2-3b-instruct' }),
			tab: exampleTab,
		})
		const { page } = ctx

		await page.locator('.composer__input').fill('How much is the Teams plan?')
		await page.locator('button[aria-label="Submit"]').click()

		// The answer that follows the tool result is rendered too.
		await page.waitForFunction(() => document.body.innerText.includes('Teams costs 25 EUR.'))

		// The run is over, so the steps fold into one line and the rows are gone.
		const summary = page.locator('.steps__summary')
		await summary.waitFor()
		assert.match(await summary.textContent(), /Completed \d+ steps? in /)
		assert.equal(await summary.getAttribute('aria-expanded'), 'false')
		assert.equal(await page.locator('.tool').count(), 0)

		// Opening it brings the call back: complete, and without a badge saying so, because a
		// finished step is the quiet default.
		await summary.click()
		assert.match(await page.locator('.tool__name').textContent(), /Reading page/)
		assert.equal(await page.locator('.tool[data-state="complete"]').count(), 1)
		assert.equal(await page.locator('.tool__head .badge').count(), 0)

		assert.equal(server.requests.length, 2)
		const second = server.requests[1]
		assert.ok(
			second.messages.some((message) => message.role === 'tool'),
			'the tool result should be sent back to the model',
		)
	} finally {
		await server.close()
	}
}
