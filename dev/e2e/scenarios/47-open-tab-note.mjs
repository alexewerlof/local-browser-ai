import assert from 'node:assert/strict'
import { localSettings, waitForPageCount } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '47-open-tab-note'

/** The note every prompt carries, and its two forms. */
const NOTE = /\[Open tab: "Example Pricing" https:\/\/example\.com\/pricing — (.*?)\]/

/**
 * The panel cannot see the page beside it, so each prompt carries one line naming that tab.
 * The line is frozen onto its own turn: a page the chat already holds is named by its handle
 * rather than "not in this chat", and a later tab never rewrites what an earlier turn sent.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['Noted', '.'] })
	try {
		// No `tab` in the config: the chat starts with no page, and the shim's tab on screen is
		// https://example.com/pricing — the page `addPage()` captures below.
		await ctx.open({ settings: localSettings(server.endpoint) })
		const { page } = ctx

		await page.locator('.composer__input').fill('What am I looking at?')
		await page.locator('[aria-label="Submit"]').click()
		await page.waitForFunction(() => document.querySelectorAll('.message--assistant').length === 1)

		// The very page the note named joins the chat, then a second prompt is sent.
		await page.evaluate(() => window.__LB_AI_TEST__.addPage())
		await waitForPageCount(page, 1)
		await page.locator('.composer__input').fill('And what does it cost?')
		await page.locator('[aria-label="Submit"]').click()
		await page.waitForFunction(() => document.querySelectorAll('.message--assistant').length === 2)

		assert.equal(server.requests.length, 2)
		const [first, second] = server.requests

		// Nothing was in the chat yet, so the first note says so.
		const firstTurn = first.messages.at(-1)
		assert.equal(firstTurn.role, 'user')
		assert.equal(firstTurn.content.match(NOTE)?.[1], 'not in this chat')

		// The page joined between the prompts, so the next note points at its handle.
		const secondTurn = second.messages.at(-1)
		assert.equal(secondTurn.role, 'user')
		assert.equal(secondTurn.content.match(NOTE)?.[1], 'in this chat as p1')

		// The explanation is in the prompt once per request, and the hint never varies with the
		// tab: a switch would otherwise rewrite the prefix every earlier turn paid for.
		assert.equal((first.messages[0].content.match(/## Open tab/g) ?? []).length, 1)
		assert.equal(second.messages[0].content, first.messages[0].content)

		// Adding the page did not rewrite the turn that came before it, byte for byte.
		assert.deepEqual(second.messages.slice(0, first.messages.length), first.messages)
	} finally {
		await server.close()
	}
}
