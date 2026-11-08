import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '25-settings-buttons'

/**
 * Every "manage this in Settings" affordance in the panel is a gear that opens Settings at
 * the section that owns the control, instead of a sentence pointing at the app menu.
 */
export async function run(ctx) {
	await ctx.open({ settings: localSettings('http://127.0.0.1:1/v1') })
	const { page } = ctx

	/** The fragment of every tab the panel asked the browser to open. */
	const openedHashes = () => page.evaluate(() => window.__LB_AI_TEST__.opened.map((url) => new URL(url).hash))

	/**
	 * Click a control and report the section Settings was asked to show. The first click
	 * creates the tab; every later one navigates that same tab.
	 */
	async function clickAndReadSection(click) {
		const before = await page.evaluate(() => ({
			opened: window.__LB_AI_TEST__.opened.length,
			updated: window.__LB_AI_TEST__.updatedTabs.length,
		}))
		await click()
		await page.waitForFunction(
			(previous) =>
				window.__LB_AI_TEST__.opened.length > previous.opened ||
				window.__LB_AI_TEST__.updatedTabs.length > previous.updated,
			before,
		)
		return page.evaluate((previous) => {
			const state = window.__LB_AI_TEST__
			const created = state.opened.length > previous.opened
			const url = created ? state.opened.at(-1) : state.updatedTabs.at(-1)?.url
			return { created, hash: url ? new URL(url).hash : null }
		}, before)
	}

	// Skills: the gear sits beside the search row at the top of the menu.
	await page.locator('.chip:has-text("Skills")').click()
	let result = await clickAndReadSection(() =>
		page.locator('.popover__header button[aria-label="Manage skills"]').click(),
	)
	assert.deepEqual(result, { created: true, hash: '#/skills' })
	// Opening Settings dismisses the popover.
	assert.equal(await page.locator('.popover').count(), 0)

	// Built-in tools and MCP each have their own gear in the group heading.
	await page.locator('.chip:has-text("Tools")').click()
	result = await clickAndReadSection(() => page.locator('button[aria-label="Manage built-in tools"]').click())
	assert.deepEqual(result, { created: false, hash: '#/tools' })

	await page.locator('.chip:has-text("Tools")').click()
	result = await clickAndReadSection(() => page.locator('button[aria-label="Manage MCP servers"]').click())
	assert.deepEqual(result, { created: false, hash: '#/mcp' })

	// Models: the gear sits beside the search row at the top of the picker.
	await page.locator('.chip--model').click()
	result = await clickAndReadSection(() => page.locator('button[aria-label="Manage models"]').click())
	assert.deepEqual(result, { created: false, hash: '#/models' })

	// The context meter's settings button lands on its own section.
	await page.locator('.meter').click()
	result = await clickAndReadSection(() => page.locator('button:has-text("Context settings")').click())
	assert.deepEqual(result, { created: false, hash: '#/context' })

	// The header gear asks for no section, so the tab keeps the section on screen.
	await page.locator('button[aria-label="Settings"]').click()
	// Four section changes came before it, all on the tab the Skills gear created.
	await page.waitForFunction(() => window.__LB_AI_TEST__.updatedTabs.length === 5)
	const last = await page.evaluate(() => window.__LB_AI_TEST__.updatedTabs.at(-1))
	assert.equal(last.url, undefined)
	assert.equal(last.active, true)
	// Only ever one Settings tab.
	assert.deepEqual(await openedHashes(), ['#/skills'])
}
