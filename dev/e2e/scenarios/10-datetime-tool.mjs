import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '10-datetime-tool'

export async function run(ctx) {
	const server = await startFakeModelServer({
		chunks: ['It is 2 November 2026.'],
		toolScript: (_body, index) => (index === 0 ? 'tool-call' : 'text'),
		toolCall: { name: 'get_current_datetime', arguments: '{}' },
	})
	try {
		await ctx.open({
			settings: localSettings(server.endpoint, {
				model: 'llama-3.2-3b-instruct',
				// Only the clock tool, so the tool result is easy to identify.
				tools: { enabled: ['get_current_datetime'], autoApprove: ['get_current_datetime'] },
			}),
		})
		const { page } = ctx

		await page.locator('.composer__input').fill('What is the date today?')
		await page.locator('button[aria-label="Send"]').click()

		await page.waitForSelector('.tool')
		assert.match(await page.locator('.tool__name').textContent(), /Checking the clock/)

		await page.waitForFunction(() => document.body.innerText.includes('It is 2 November 2026.'))
		assert.equal(await page.locator('.tool__head .badge').textContent(), 'complete')

		assert.equal(server.requests.length, 2)
		const toolMessage = server.requests[1].messages.find((message) => message.role === 'tool')
		assert.ok(toolMessage, 'the clock result should be sent back to the model')

		const content =
			typeof toolMessage.content === 'string' ? toolMessage.content : JSON.stringify(toolMessage.content)
		const result = JSON.parse(content)
		assert.equal(result.ok, true)
		assert.match(result.date, /^\d{4}-\d{2}-\d{2}$/)
		assert.match(result.local, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
		assert.ok(result.timeZone)
		assert.ok(Number.isFinite(Date.parse(result.utc)))

		// Locale preferences travel with the answer so the model can present the date the
		// way this user reads it, while the ISO fields stay Gregorian for arithmetic.
		assert.equal(typeof result.locale, 'string')
		assert.equal(typeof result.calendar, 'string')
		assert.equal(typeof result.numberingSystem, 'string')
		assert.ok(['h11', 'h12', 'h23', 'h24'].includes(result.hourCycle))
		assert.equal(typeof result.weekdayLocal, 'string')
		assert.ok(['active', 'inactive', 'none'].includes(result.dst))
		assert.ok(result.weekStart === undefined || (result.weekStart >= 1 && result.weekStart <= 7))

		// The week number is ISO 8601 and the week-based year can differ from the
		// calendar year; the epoch is whole seconds.
		assert.ok(Number.isInteger(result.isoWeek) && result.isoWeek >= 1 && result.isoWeek <= 53)
		assert.ok(Number.isInteger(result.isoWeekYear))
		assert.ok(Math.abs(result.epochSeconds - Date.now() / 1000) < 3600)

		// The week number is ISO 8601 and the week-based year can differ from the
		// calendar year; the epoch is whole seconds.
		assert.ok(Number.isInteger(result.isoWeek) && result.isoWeek >= 1 && result.isoWeek <= 53)
		assert.ok(Number.isInteger(result.isoWeekYear))
		assert.ok(Math.abs(result.epochSeconds - Date.now() / 1000) < 3600)
	} finally {
		await server.close()
	}
}
