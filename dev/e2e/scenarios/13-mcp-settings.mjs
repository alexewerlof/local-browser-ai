import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startMockMcpServer } from '../mock-mcp-server.mjs'

export const name = '13-mcp-settings'

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
		await ctx.openSettings({
			settings: localSettings('http://127.0.0.1:1/v1', {
				tools: { enabled: [], autoApprove: [], mcp: [server({ url: mcp.url })] },
			}),
		})
		// The client probes `server/discover`; the legacy mock answers 400, which is handled.
		ctx.expectConsoleError(/400 \(Bad Request\)/)
		const { page } = ctx

		await page.locator('.settings__nav-item:has-text("Tools")').click()
		await page.waitForSelector('.mcp-server')

		// Discovery runs on mount: the server is up, so its two tools are listed.
		const card = page.locator('.group:has(.mcp-server)').first()
		assert.match(await card.textContent(), /Mock tools/)
		assert.match(await card.textContent(), new RegExp(mcp.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
		await page.waitForSelector('.mcp-server .row-item--tool')
		assert.equal(await page.locator('.mcp-server .row-item--tool').count(), 2)

		// Per-tool availability is a checkbox on the server record, like a built-in tool.
		await page.locator('input[aria-label="Enable Echo"]').click()
		await page.waitForFunction(() =>
			window.__LB_AI_TEST__.currentSettings()?.tools?.mcp?.[0]?.disabledTools?.includes('echo'),
		)

		// And per-tool auto-approve is the switch on the row.
		await page.locator('button[role="switch"][aria-label="Run Add without asking"]').click()
		await page.waitForFunction(() =>
			window.__LB_AI_TEST__.currentSettings()?.tools?.mcp?.[0]?.autoApproveTools?.includes('add'),
		)

		// Editing replaces that server's row, in the same card; there is no second panel.
		await page.locator('button[aria-label="Edit Mock tools"]').click()
		const editor = page.locator('.mcp-editor')
		await editor.waitFor()
		assert.equal(await page.locator('.mcp-server').count(), 0)
		assert.match(await editor.textContent(), /Edit Mock tools/)

		// Headers are Name/Value rows: fill them, add rows with the button below.
		await editor.locator('input[aria-label="Header 1 name"]').fill('Authorization')
		await editor.locator('input[aria-label="Header 1 value"]').fill('Bearer abc')
		await editor.locator('button:has-text("Add header")').click()
		await editor.locator('input[aria-label="Header 2 name"]').fill('X-Env')
		await editor.locator('input[aria-label="Header 2 value"]').fill('test')
		// A row left blank is dropped instead of becoming an empty header.
		await editor.locator('button:has-text("Add header")').click()
		await editor.locator('button[role="switch"][aria-label="Send requests without an Origin header"]').click()
		await editor.locator('button:has-text("Save server")').click()
		await page.waitForFunction(
			() => window.__LB_AI_TEST__.currentSettings()?.tools?.mcp?.[0]?.headers?.Authorization === 'Bearer abc',
		)
		assert.equal(await page.locator('.mcp-server').count(), 1)

		let stored = await page.evaluate(() => window.__LB_AI_TEST__.readSettings())
		assert.deepEqual(stored.tools.mcp[0].headers, { Authorization: 'Bearer abc', 'X-Env': 'test' })
		assert.equal(stored.tools.mcp[0].stripOrigin, true)

		// The trash button removes that row only.
		await page.locator('button[aria-label="Edit Mock tools"]').click()
		await page.locator('button[aria-label="Remove header 2"]').click()
		await page.locator('.mcp-editor button:has-text("Save server")').click()
		await page.waitForFunction(
			() => window.__LB_AI_TEST__.currentSettings()?.tools?.mcp?.[0]?.headers?.['X-Env'] === undefined,
		)
		stored = await page.evaluate(() => window.__LB_AI_TEST__.readSettings())
		assert.deepEqual(stored.tools.mcp[0].headers, { Authorization: 'Bearer abc' })

		// A repeated name is a row error and blocks the save.
		await page.locator('button[aria-label="Edit Mock tools"]').click()
		await page.locator('.mcp-editor button:has-text("Add header")').click()
		await page.locator('.mcp-editor input[aria-label="Header 2 name"]').fill('authorization')
		await page.locator('.mcp-editor input[aria-label="Header 2 value"]').fill('other')
		await page.locator('.mcp-editor button:has-text("Save server")').click()
		await page.waitForSelector('.mcp-header__error')
		assert.match(await page.locator('.mcp-header__error').first().textContent(), /already used by row 1/)
		stored = await page.evaluate(() => window.__LB_AI_TEST__.readSettings())
		assert.deepEqual(stored.tools.mcp[0].headers, { Authorization: 'Bearer abc' })

		// Cancel restores the row untouched.
		await page.locator('.mcp-editor button:has-text("Cancel")').click()
		await page.waitForSelector('.mcp-server')
		assert.equal(await page.locator('.mcp-server').count(), 1)

		// Add a second server through the editor.
		await page.locator('.section__action button:has-text("Add MCP server")').click()
		const added = page.locator('.mcp-editor')
		await added.locator('input').nth(0).fill('Second server')
		await added.locator('input').nth(1).fill(mcp.url)
		await added.locator('button:has-text("Add server")').click()
		await page.waitForFunction(() => window.__LB_AI_TEST__.currentSettings()?.tools?.mcp?.length === 2)
		assert.equal(await page.locator('.mcp-server').count(), 2)

		// Remove it again; the first server keeps its tool choice.
		await page.locator('button[aria-label="Remove Second server"]').click()
		await page.waitForFunction(() => window.__LB_AI_TEST__.currentSettings()?.tools?.mcp?.length === 1)

		stored = await page.evaluate(() => window.__LB_AI_TEST__.readSettings())
		assert.deepEqual(stored.tools.mcp[0].disabledTools, ['echo'])

		// Invalid URLs are rejected before anything is stored.
		await page.locator('.section__action button:has-text("Add MCP server")').click()
		const invalid = page.locator('.mcp-editor')
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
