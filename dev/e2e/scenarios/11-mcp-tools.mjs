import assert from 'node:assert/strict'
import { ALL_TOOLS, expandSteps, localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'
import { startMockMcpServer } from '../mock-mcp-server.mjs'

export const name = '11-mcp-tools'

/** `mcp_<server slug>_<tool>` — see `mcpToolName` in src/core/mcp.ts. */
const TOOL_NAME = 'mcp_mock_tools_echo'

/** The mock answers 401 without this, so the tool call proves the header was sent. */
const HEADERS = { Authorization: 'Bearer abc' }

export async function run(ctx) {
	const mcp = await startMockMcpServer({ requireHeaders: HEADERS })
	const server = await startFakeModelServer({
		chunks: ['The', ' server', ' said', ' hello.'],
		toolScript: (body) => (body.messages.at(-1)?.role === 'tool' ? 'text' : 'tool-call'),
		toolCall: () => ({ name: TOOL_NAME, arguments: JSON.stringify({ message: 'hello' }) }),
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
							headers: HEADERS,
							enabled: true,
							autoApprove: true,
							disabledTools: [],
						},
					],
				},
			}),
		})
		// The client probes `server/discover` before falling back to `initialize`; the mock
		// SDK server is legacy-only and answers 400, which the client handles.
		ctx.expectConsoleError(/400 \(Bad Request\)/)
		const { page } = ctx

		await page.locator('.composer__input').fill('Say hello through the mock server.')
		await page.locator('button[aria-label="Submit"]').click()

		await page.waitForFunction(() => document.body.innerText.includes('The server said hello.'))
		// The row names the tool and its server once the steps have folded away.
		await expandSteps(page)
		assert.equal(await page.locator('.tool__name').textContent(), 'Echo')
		assert.match(await page.locator('.tool__head').textContent(), /MCP · Mock tools/)

		// The advertised tool is namespaced and labelled with its server.
		assert.equal(server.requests.length, 2)
		const advertised = server.requests[0].tools.find((tool) => tool.function.name === TOOL_NAME)
		assert.ok(advertised, 'the MCP tool should be advertised to the model')
		assert.match(advertised.function.description, /^\[MCP: Mock tools\]/)

		// The result travels back to the model.
		const toolMessage = server.requests[1].messages.find((message) => message.role === 'tool')
		assert.match(JSON.stringify(toolMessage), /echo: hello/)

		// And the call really reached the MCP server, with the raw tool name.
		assert.deepEqual(mcp.calls, [{ name: 'echo', arguments: { message: 'hello' } }])
		// No request was refused, so the configured Authorization header was sent.
		assert.deepEqual(mcp.denied, [])

		// The composer menu exposes servers as checkboxes and persists the choice.
		await page.locator('.chip:has-text("Tools")').click()
		await page.waitForSelector('.popover__check:has-text("Mock tools")')
		await page.locator('.popover__check:has-text("Mock tools") input').click()
		await page.waitForFunction(() => window.__LB_AI_TEST__.currentSettings()?.tools?.mcp?.[0]?.enabled === false)
	} finally {
		await server.close()
		await mcp.close()
	}
}
