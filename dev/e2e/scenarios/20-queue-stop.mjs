import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '20-queue-stop'

async function waitFor(predicate, timeout = 15000) {
	const start = Date.now()
	while (Date.now() - start < timeout) {
		if (predicate()) return
		await new Promise((resolve) => setTimeout(resolve, 50))
	}
	throw new Error('Timed out waiting for the fake server')
}

export async function run(ctx) {
	const server = await startFakeModelServer({
		chunks: ['one', ' two', ' three', ' four', ' five', ' six', ' seven', ' eight'],
		delayMs: 120,
	})
	try {
		await ctx.open({ settings: localSettings(server.endpoint) })
		const { page } = ctx

		await page.locator('.composer__input').fill('First prompt')
		await page.locator('button[aria-label="Submit"]').click()
		await page.waitForSelector('button[aria-label="Stop generating"]')

		await page.locator('.composer__input').fill('Second prompt')
		await page.locator('button[aria-label="Submit"]').click()
		await page.waitForSelector('.composer__queue')
		assert.equal(await page.locator('.composer__queue-item').count(), 1)

		// Stopping ends the current turn but parks the queue: the user asked to stop the
		// loop, not to skip this answer and run everything else.
		await page.locator('button[aria-label="Stop generating"]').click()
		await page.waitForSelector('button[aria-label="Continue"]')
		await page.waitForFunction(() => document.querySelectorAll('.message--user').length === 1)
		assert.equal(await page.locator('.composer__queue-item').count(), 1)
		assert.equal(server.requests.length, 1, 'Stop must not start the queued prompt')

		// Continue hands the loop back to the queue.
		await page.locator('button[aria-label="Continue"]').click()

		await waitFor(() => server.requests.length === 2)
		await page.waitForFunction(() => document.querySelectorAll('.message--user').length === 2)
		const userTexts = await page.locator('.message--user .message__text').allTextContents()
		assert.deepEqual(userTexts, ['First prompt', 'Second prompt'])
		assert.equal(await page.locator('.composer__queue').count(), 0)
		assert.equal(await page.locator('button[aria-label="Continue"]').count(), 0)

		// The queued prompt really is running, not just rendered.
		await page.waitForSelector('button[aria-label="Stop generating"]')
		assert.match(server.requests[1].messages.at(-1).content, /Second prompt/)
	} finally {
		await server.close()
	}
}
