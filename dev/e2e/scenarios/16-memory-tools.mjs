import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '16-memory-tools'

/**
 * `remember` creates without asking, and `recall` finds it again. Both reach storage.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({
		chunks: ['Saved.'],
		toolScript: (_body, index) => (index < 2 ? 'tool-call' : 'text'),
		toolCall: (_body, index) =>
			index === 0
				? {
						name: 'remember',
						arguments: JSON.stringify({ text: 'The user prefers tabs.', title: 'Formatting' }),
					}
				: { name: 'recall', arguments: JSON.stringify({ query: 'tabs' }) },
	})
	try {
		await ctx.open({
			settings: localSettings(server.endpoint, {
				tools: { enabled: ['remember', 'recall'], autoApprove: ['recall'], mcp: [] },
			}),
		})
		const { page } = ctx

		await page.locator('.composer__input').fill('Remember that I prefer tabs')
		await page.locator('button[aria-label="Submit"]').click()

		await page.waitForFunction(() => document.querySelectorAll('.tool').length === 2)
		const labels = await page.locator('.tool__name').allTextContents()
		assert.deepEqual(labels, ['Saving to memory', 'Searching memory'])

		await page.waitForFunction(() => document.body.innerText.includes('Saved.'))
		assert.deepEqual(await page.locator('.tool__head .badge').allTextContents(), ['done', 'done'])

		// Both tools are advertised to the model.
		const toolNames = server.requests[0].tools.map((tool) => tool.function.name)
		assert.ok(toolNames.includes('remember'))
		assert.ok(toolNames.includes('recall'))

		// The remember result reports a create, and the item is in storage.
		const rememberResult = server.requests[1].messages.find(
			(message) => message.role === 'tool' && String(message.content).includes('Formatting'),
		)
		assert.ok(rememberResult, 'the remember result should be sent back to the model')
		const created = JSON.parse(String(rememberResult.content))
		assert.equal(created.ok, true)
		assert.equal(created.action, 'created')
		assert.equal(created.mode, 'auto')

		await page.waitForFunction(() => window.__LB_AI_TEST__.currentMemory()?.items?.length === 1)
		const stored = await page.evaluate(() => window.__LB_AI_TEST__.readMemory())
		assert.equal(stored.items[0].text, 'The user prefers tabs.')
		assert.equal(stored.items[0].title, 'Formatting')
		assert.equal(stored.items[0].mode, 'auto')
		assert.equal(stored.items[0].source.conversationId.length > 0, true)

		// Recall finds what remember just saved.
		const recallResult = server.requests[2].messages.find(
			(message) => message.role === 'tool' && String(message.content).includes('memories'),
		)
		assert.ok(recallResult, 'the recall result should be sent back to the model')
		const recalled = JSON.parse(String(recallResult.content))
		assert.equal(recalled.found, 1)
		assert.equal(recalled.total, 1)
		assert.equal(recalled.memories[0].text, 'The user prefers tabs.')
	} finally {
		await server.close()
	}
}
