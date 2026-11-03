import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startMockMcpServer } from '../mock-mcp-server.mjs'

export const name = '13-mcp-options'

const server = (overrides = {}) => ({
	id: 'mcp_1',
	label: 'Mock tools',
	url: 'http://127.0.0.1:1/mcp',
	headers: {},
	enabled: true,
	autoApprove: false,
	disabledTools: [],
	...overrides,
})

export async function run(ctx) {
	const mcp = await startMockMcpServer()

	try {
		await ctx.openOptions({
			settings: localSettings('http://127.0.0.1:1/v1', {
				tools: { enabled: [], autoApprove: [], mcp: [server({ url: mcp.url })] },
			}),
		})
		// The client probes `server/discover`; the legacy mock answers 400, which is handled.
		ctx.expectConsoleError(/400 \(Bad Request\)/)
		const { page } = ctx

		await page.locator('.options__nav-item:has-text("MCP")').click()
		await page.waitForSelector('.mcp-server')

		// Discovery runs on mount: the server is up, so its two tools are listed.
		assert.match(await page.locator('.mcp-server').textContent(), /Mock tools/)
		assert.match(
			await page.locator('.mcp-server').textContent(),
			new RegExp(mcp.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
		)
		await page.waitForSelector('.mcp-tool')
		assert.equal(await page.locator('.mcp-tool').count(), 2)

		// Per-tool switches live on the server record.
		await page.locator('button[role="switch"][aria-label="Enable echo on Mock tools"]').click()
		await page.waitForFunction(() =>
			window.__LB_AI_TEST__.currentSettings()?.tools?.mcp?.[0]?.disabledTools?.includes('echo'),
		)

		// Add a second server through the editor.
		await page.locator('.section__action button:has-text("Add MCP server")').click()
		const editor = page.locator('section.group:has-text("Add an MCP server")')
		await editor.locator('input').nth(0).fill('Second server')
		await editor.locator('input').nth(1).fill(mcp.url)
		await editor.locator('button:has-text("Add server")').click()
		await page.waitForFunction(() => window.__LB_AI_TEST__.currentSettings()?.tools?.mcp?.length === 2)
		assert.equal(await page.locator('.mcp-server').count(), 2)

		// Remove it again; the first server keeps its tool choice.
		await page.locator('.mcp-server').nth(1).locator('button:has-text("Remove")').click()
		await page.waitForFunction(() => window.__LB_AI_TEST__.currentSettings()?.tools?.mcp?.length === 1)

		const stored = await page.evaluate(() => window.__LB_AI_TEST__.readSettings())
		assert.deepEqual(stored.tools.mcp[0].disabledTools, ['echo'])

		// Invalid URLs are rejected before anything is stored.
		await page.locator('.section__action button:has-text("Add MCP server")').click()
		const invalid = page.locator('section.group:has-text("Add an MCP server")')
		await invalid.locator('input').nth(0).fill('Bad server')
		await invalid.locator('input').nth(1).fill('ws://localhost:9000/mcp')
		await invalid.locator('button:has-text("Add server")').click()
		await page.waitForSelector('.notice--bad')
		assert.match(await page.locator('.notice--bad').textContent(), /http/)
		assert.equal(await page.locator('.mcp-server').count(), 1)
	} finally {
		await mcp.close()
	}
}
