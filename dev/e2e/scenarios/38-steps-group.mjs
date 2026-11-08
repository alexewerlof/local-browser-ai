import assert from 'node:assert/strict'
import { exampleTab, localSettings, waitForPageCount } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '38-steps-group'

/**
 * The steps of one answer — its tool calls and its thinking — read as one flow while the run
 * streams, and fold into a single line when it ends, so the answer is what the user sees.
 *
 * The rows are the only sign of progress a local model gives, so they cannot simply be
 * hidden mid-run; and a finished answer's steps are noise beside the answer, so they cannot
 * simply be left open either.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({
		chunks: ['The page lists three plans.'],
		// Two steps, then the answer: enough rows that folding them is worth it. The delay
		// keeps the streaming state observable instead of racing the fold.
		delayMs: 200,
		toolScript: (_body, index) => (index < 2 ? 'tool-call' : 'text'),
		toolCall: { name: 'read_page', arguments: JSON.stringify({ mode: 'outline', page: 'p1' }) },
	})
	try {
		await ctx.open({
			settings: localSettings(server.endpoint, { model: 'llama-3.2-3b-instruct' }),
			tab: exampleTab,
		})
		const { page } = ctx
		await waitForPageCount(page, 1)

		await page.locator('.composer__input').fill('What plans are there?')
		await page.locator('button[aria-label="Submit"]').click()

		// While the run streams, every row is on screen and nothing is folded.
		await page.waitForFunction(() => document.querySelectorAll('.steps__list .tool').length === 2)
		assert.equal(await page.locator('.steps__summary').count(), 0, 'nothing to fold mid-run')

		// The answer arrives, and the steps collapse into one line above it. Two tool steps
		// plus the step that produced the answer make three.
		await page.waitForFunction(() => document.body.innerText.includes('The page lists three plans.'))
		const summary = page.locator('.steps__summary')
		await summary.waitFor()
		assert.equal(await summary.getAttribute('aria-expanded'), 'false')
		assert.match(await summary.textContent(), /Completed 3 steps in /)
		assert.match(await summary.textContent(), /tokens/)
		assert.equal(await page.locator('.steps__list').count(), 0, 'the rows are folded away')

		// The answer itself is not part of the group: it is still on screen while folded.
		assert.match(await page.locator('.message--assistant').last().textContent(), /The page lists three plans\./)

		// Opening the summary brings both rows back, and the choice sticks.
		await summary.click()
		assert.equal(await summary.getAttribute('aria-expanded'), 'true')
		assert.equal(await page.locator('.steps__list .tool').count(), 2)

		// A row still opens its own call detail, which is flat text rather than a card.
		await page.locator('.tool__head').first().click()
		await page.waitForSelector('.tool__body')
		assert.match(await page.locator('.tool__body').textContent(), /Input/)
		assert.match(await page.locator('.tool__body').textContent(), /Output/)

		// An answer with no steps gets no group at all, so a plain reply stays one block.
		await page.locator('.composer__input').fill('Thanks')
		await page.locator('button[aria-label="Submit"]').click()
		await page.waitForFunction(() => {
			const answers = document.querySelectorAll('.message--assistant')
			return answers.length === 2 && answers[1].querySelector('.message__footer') !== null
		})
		assert.equal(await page.locator('.steps__summary').count(), 1, 'only the tool answer has steps')
		assert.equal(await page.locator('.message--assistant').last().locator('.steps').count(), 0)
	} finally {
		await server.close()
	}
}
