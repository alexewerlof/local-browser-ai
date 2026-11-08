import assert from 'node:assert/strict'
import { localSettings, waitForPageCount } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '34-tool-step-limit'

/**
 * Hitting the tool-step cap asks the user instead of ending the answer silently.
 *
 * A local model exploring an unfamiliar page will spend its whole budget on reads, and a
 * run that simply stops leaves tool cards and no answer — indistinguishable from a hang.
 * Continue spends another budget over the same answer, so the counter starts again and
 * the calls already made are not repeated.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({
		chunks: ['The page states it in the first paragraph.'],
		// Two tool calls, then a stop at the cap, then (after Continue) the answer.
		toolScript: (_body, index) => (index < 2 ? 'tool-call' : 'text'),
		toolCall: { name: 'read_page', arguments: JSON.stringify({ mode: 'outline' }) },
	})
	try {
		await ctx.open({
			settings: localSettings(server.endpoint, {
				model: 'llama-3.2-3b-instruct',
				// The cap this scenario is about; the fixture default is 4.
				context: {
					compactionThreshold: 0.75,
					keepRecentTurns: 4,
					outputReserveRatio: 0.2,
					maxToolSteps: 2,
				},
				tools: { enabled: ['read_page'], autoApprove: ['read_page'] },
			}),
			tab: { id: 42, url: 'https://example.com/pricing', title: 'Example Pricing' },
		})
		const { page } = ctx

		await waitForPageCount(page, 1)
		await page.locator('.composer__input').fill('What does the page say?')
		await page.locator('button[aria-label="Submit"]').click()

		// Two steps were spent, so the cap is reached and the run stops without an answer.
		await page.waitForSelector('.banner--warn')
		const banner = await page.locator('.banner--warn').textContent()
		assert.match(banner, /limit of 2 tool steps/)
		assert.equal(await page.locator('.tool').count(), 2)
		assert.equal(server.requests.length, 2, 'the cap stops the loop after two steps')
		assert.equal(await page.locator('.tool__head .badge').last().textContent(), 'done')

		// The number in the sentence opens the Settings section that owns the control.
		await page.locator('.banner__link').click()
		await page.waitForFunction(() => window.__LB_AI_TEST__.opened.some((url) => url.includes('settings.html')))

		// Continue spends another budget over the same answer and gets the text.
		await page.locator('.banner--warn button', { hasText: 'Continue' }).click()
		await page.waitForFunction(() => document.body.innerText.includes('The page states it in the first paragraph.'))

		assert.equal(await page.locator('.banner--warn').count(), 0)
		// One bubble: the continuation adds to the answer that stopped, it does not open a
		// second one with the same tool cards in it.
		assert.equal(await page.locator('.message--assistant').count(), 1)
		assert.equal(await page.locator('.tool').count(), 2)

		// The resumed request continues the conversation instead of restarting it: the
		// provider must see the tool calls it already made, or the model repeats them.
		const resumed = server.requests.at(-1)
		assert.deepEqual(
			resumed.messages.map((message) => message.role),
			['system', 'user', 'assistant', 'tool', 'tool'],
		)
		const withCalls = resumed.messages.filter(
			(message) => message.role === 'assistant' && Array.isArray(message.tool_calls),
		)
		assert.equal(withCalls.length, 1)
		assert.equal(withCalls[0].tool_calls.length, 2, 'both earlier calls are replayed')
	} finally {
		await server.close()
	}
}
