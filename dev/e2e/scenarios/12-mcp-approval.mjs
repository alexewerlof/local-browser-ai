import assert from 'node:assert/strict'
import { ALL_TOOLS, localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'
import { startMockMcpServer } from '../mock-mcp-server.mjs'

export const name = '12-mcp-approval'

const TOOL_NAME = 'mcp_mock_tools_echo'

export async function run(ctx) {
	const mcp = await startMockMcpServer()
	const server = await startFakeModelServer({
		chunks: ['Done.'],
		toolScript: (body) => (body.messages.some((message) => message.role === 'tool') ? 'text' : 'tool-call'),
		toolCall: () => ({ name: TOOL_NAME, arguments: JSON.stringify({ message: 'hi' }) }),
	})

	try {
		await ctx.open({
			settings: localSettings(server.endpoint, {
				model: 'llama-3.2-3b-instruct',
				tools: {
					enabled: ALL_TOOLS,
					autoApprove: ALL_TOOLS,
					mcp: [
						{
							id: 'mcp_1',
							label: 'Mock tools',
							url: mcp.url,
							headers: {},
							// Not trusted: every call must be approved on the card.
							enabled: true,
							autoApprove: false,
							disabledTools: [],
						},
					],
				},
			}),
		})
		// The client probes `server/discover`; the legacy mock answers 400, which is handled.
		ctx.expectConsoleError(/400 \(Bad Request\)/)
		const { page } = ctx

		// First turn: allow.
		await page.locator('.composer__input').fill('Call the tool.')
		await page.locator('button[aria-label="Send"]').click()
		await page.waitForSelector('.tool__approval')
		await page.locator('.tool__approval button', { hasText: 'Allow' }).click()
		await page.waitForFunction(() => document.body.innerText.includes('Done.'))
		assert.equal(mcp.calls.length, 1, 'an approved call should reach the server')

		// Second turn: deny. The server must not see the call.
		await page.locator('.composer__input').fill('Call it again.')
		await page.locator('button[aria-label="Send"]').click()
		await page.waitForSelector('.tool__approval')
		await page.locator('.tool__approval button', { hasText: 'Deny' }).click()
		await page.waitForFunction(() => !document.querySelector('.tool__approval'))
		await page.waitForFunction(() => document.querySelectorAll('.tool').length >= 2)

		assert.equal(mcp.calls.length, 1, 'a denied call must never reach the server')
		const lastRequest = server.requests.at(-1)
		const toolMessage = lastRequest.messages.find((message) => message.role === 'tool')
		assert.match(JSON.stringify(toolMessage), /declined/)
	} finally {
		await server.close()
		await mcp.close()
	}
}
