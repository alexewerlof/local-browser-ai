import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '05-request-shape'

export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['ok'] })
	try {
		await ctx.open({ settings: localSettings(server.endpoint) })
		const { page } = ctx

		await page.locator('.composer__input').fill('What does it cost?')
		await page.locator('button[aria-label="Send"]').click()
		await page.waitForFunction(() => document.body.innerText.includes('ok'))

		assert.equal(server.requests.length, 1)
		const body = server.requests[0]

		// System prompt is sent separately from the message list.
		assert.equal(body.messages[0].role, 'system')
		assert.match(body.messages[0].content, /You are a test assistant/)
		// The language preferences ride in the prompt, so models without tools get them too.
		assert.match(body.messages[0].content, /their browser prefers/)

		const last = body.messages.at(-1)
		assert.equal(last.role, 'user')
		assert.match(last.content, /What does it cost\?/)

		// Tool definitions are advertised because the model id looks tool-capable.
		assert.ok(Array.isArray(body.tools) && body.tools.length > 0)
		const toolNames = body.tools.map((tool) => tool.function.name)
		assert.ok(toolNames.includes('find_in_page'))

		// Usage reporting is requested for streaming responses.
		assert.equal(body.stream_options?.include_usage, true)
	} finally {
		await server.close()
	}
}
