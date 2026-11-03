import assert from 'node:assert/strict'
import { ALL_TOOLS, localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '14-mcp-failure'

export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['Answer', ' without', ' remote', ' tools.'] })

	try {
		// Nothing listens on port 1, so connecting fails immediately.
		await ctx.open({
			settings: localSettings(server.endpoint, {
				tools: {
					enabled: ALL_TOOLS,
					autoApprove: ALL_TOOLS,
					mcp: [
						{
							id: 'mcp_1',
							label: 'Broken server',
							url: 'http://127.0.0.1:1/mcp',
							headers: {},
							enabled: true,
							autoApprove: true,
							disabledTools: [],
						},
					],
				},
			}),
		})
		// Chromium logs the refused connection; the app must handle it, not crash.
		ctx.expectConsoleError(/ERR_CONNECTION_REFUSED|Failed to load resource/)
		const { page } = ctx

		await page.locator('.composer__input').fill('Are you there?')
		await page.locator('button[aria-label="Submit"]').click()

		// The turn still completes with the built-in tools.
		await page.waitForFunction(() => document.body.innerText.includes('Answer without remote tools.'))
		await page.waitForSelector('.banner--warn')
		const banner = await page.locator('.banner--warn').textContent()
		assert.match(banner, /Broken server/)
		assert.match(banner, /Could not reach/)

		const names = (server.requests[0].tools ?? []).map((tool) => tool.function.name)
		assert.ok(names.includes('find_in_page'), 'built-in tools still reach the model')
		assert.equal(
			names.filter((name) => name.startsWith('mcp_')).length,
			0,
			'a server that is down must not advertise tools',
		)
	} finally {
		await server.close()
	}
}
