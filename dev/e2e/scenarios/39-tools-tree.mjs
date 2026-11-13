import assert from 'node:assert/strict'
import { ALL_TOOLS, localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'
import { startMockMcpServer } from '../mock-mcp-server.mjs'

export const name = '39-tools-tree'

/**
 * The Tools chip is one tree: the built-in set and each MCP server are peers, both
 * collapsed to start with, and both switch tools on and off with the same checkbox. A
 * server keeps its per-tool opt-outs while it is switched off and drops them when the
 * whole set is switched back on.
 */
export async function run(ctx) {
	const mcp = await startMockMcpServer()
	const model = await startFakeModelServer({ chunks: ['ok'] })

	try {
		await ctx.open({
			settings: localSettings(model.endpoint, {
				tools: {
					enabled: ALL_TOOLS,
					autoApprove: ALL_TOOLS,
					mcp: [
						{
							id: 'mcp_1',
							label: 'Mock tools',
							url: mcp.url,
							headers: {},
							enabled: true,
							autoApprove: false,
							autoApproveTools: [],
							disabledTools: [],
						},
					],
				},
			}),
		})
		const { page } = ctx
		// The client probes `server/discover`; the legacy mock answers 400, which is handled.
		ctx.expectConsoleError(/400 \(Bad Request\)/)

		await page.locator('.tools-menu__trigger').click()
		// Discovery runs when the menu opens; the mock offers two tools.
		await page.waitForSelector('.tool-tree__head:has-text("2 of 2 tools enabled")')
		assert.equal(await page.locator('.tool-tree__group').count(), 2)
		// Everything starts folded, so the menu stays a list of sets.
		assert.equal(await page.locator('.tool-tree__row').count(), 0)

		// Expanding the built-in set lists its tools, each name above its description.
		await page.locator('.tool-tree__toggle:has-text("Built-in")').click()
		const readPage = page.locator('.tool-tree__row:has-text("Read page")')
		await readPage.waitFor()
		assert.match(await readPage.textContent(), /outline/)
		assert.equal(await readPage.locator('svg').count(), 0)
		assert.equal(
			await page.locator('.tool-tree__toggle:has-text("Built-in")').getAttribute('aria-expanded'),
			'true',
		)

		// Switching one built-in tool off turns the group into a partial selection.
		await readPage.locator('.checkbox').click()
		await page.waitForFunction(() => !window.__LB_AI_TEST__.currentSettings().tools.enabled.includes('read_page'))
		assert.equal(
			await page.evaluate(() => document.querySelector('.tool-tree__head .checkbox').indeterminate),
			true,
		)

		// The server is a peer node; its own tools only appear when it is expanded.
		await page.locator('.tool-tree__toggle:has-text("Mock tools")').click()
		await page.waitForSelector('.tool-tree__row:has-text("Echo")')
		assert.equal(await page.locator('.tool-tree__tools').nth(1).locator('.tool-tree__row').count(), 2)
		await ctx.shot('tree')

		// One MCP tool off is recorded as a per-tool opt-out.
		await page.locator('.tool-tree__row:has-text("Echo") .checkbox').click()
		await page.waitForFunction(() =>
			window.__LB_AI_TEST__.currentSettings().tools.mcp[0].disabledTools.includes('echo'),
		)
		const serverHead = page.locator('.tool-tree__head:has-text("Mock tools") .checkbox')
		assert.equal(await serverHead.evaluate((element) => element.indeterminate), true)

		// A partial set clicked again means "all of them", so the opt-out is cleared.
		await serverHead.click()
		await page.waitForFunction(
			() => window.__LB_AI_TEST__.currentSettings().tools.mcp[0].disabledTools.length === 0,
		)

		// A full set clicked again switches the server off, and its tools say so.
		await serverHead.click()
		await page.waitForFunction(() => window.__LB_AI_TEST__.currentSettings().tools.mcp[0].enabled === false)
		assert.equal(await page.locator('.tool-tree__row:has-text("Echo") .checkbox').isDisabled(), true)

		// Switching it back on makes the whole set available again.
		await serverHead.click()
		await page.waitForFunction(() => window.__LB_AI_TEST__.currentSettings().tools.mcp[0].enabled === true)

		// The chip counts tools, not sets: five built-ins plus the server's two.
		assert.equal(await page.locator('.tools-menu__trigger .menu-item__count').textContent(), '7')
	} finally {
		await model.close()
		await mcp.close()
	}
}
