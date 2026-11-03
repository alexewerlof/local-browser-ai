import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '15-memory-context'

/**
 * Memory reaches the prompt as its own block: `always` items on every turn, `auto` items
 * only when the question matches, and `tool` items never automatically.
 */
export const memory = {
	version: 1,
	items: [
		{
			id: 'm_always',
			title: 'Style',
			text: 'Prefers concise answers.',
			mode: 'always',
			scope: 'global',
			createdAt: 1,
			updatedAt: 1,
		},
		{
			id: 'm_auto',
			title: 'Project',
			text: 'Works on a Rust parser.',
			mode: 'auto',
			scope: 'global',
			createdAt: 2,
			updatedAt: 2,
		},
		{
			id: 'm_tool',
			title: 'Editor',
			text: 'Uses Neovim.',
			mode: 'tool',
			scope: 'global',
			createdAt: 3,
			updatedAt: 3,
		},
	],
}

async function waitForRequests(server, count) {
	const started = Date.now()
	while (server.requests.length < count) {
		if (Date.now() - started > 10000) {
			throw new Error(`timed out waiting for ${count} requests`)
		}
		await new Promise((resolve) => setTimeout(resolve, 50))
	}
}

export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['Noted.'] })
	try {
		await ctx.open({
			settings: localSettings(server.endpoint),
			storage: { 'memory.v1': memory },
		})
		const { page } = ctx

		// The meter reports memory before the first request, because the store loads on boot.
		await page.locator('.meter').click()
		assert.match(await page.locator('.popover').textContent(), /Memory/)
		await page.keyboard.press('Escape')

		await page.locator('.composer__input').fill('Tell me about my Rust parser')
		await page.locator('button[aria-label="Submit"]').click()
		await waitForRequests(server, 1)
		await page.waitForFunction(() => !document.querySelector('.composer__box--streaming'))

		const first = server.requests[0].messages[0].content
		assert.match(first, /## Memory/)
		assert.match(first, /Prefers concise answers/)
		// The question matches the Rust project, so that memory rides along.
		assert.match(first, /Works on a Rust parser/)
		// Tool-only memory is never injected.
		assert.doesNotMatch(first, /Uses Neovim/)
		// The footer tells the model how to reach the rest only when it has the tool.
		assert.match(first, /recall/)

		// A prompt that does not match drops the auto memory but keeps the always one.
		await page.locator('.composer__input').fill("What's the weather like today?")
		await page.locator('button[aria-label="Submit"]').click()
		await waitForRequests(server, 2)
		await page.waitForFunction(() => !document.querySelector('.composer__box--streaming'))

		const second = server.requests[1].messages[0].content
		assert.match(second, /Prefers concise answers/)
		assert.doesNotMatch(second, /Works on a Rust parser/)
		assert.doesNotMatch(second, /Uses Neovim/)
	} finally {
		await server.close()
	}
}
