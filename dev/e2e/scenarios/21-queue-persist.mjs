import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '21-queue-persist'

async function waitFor(predicate, timeout = 15000) {
	const start = Date.now()
	while (Date.now() - start < timeout) {
		if (predicate()) return
		await new Promise((resolve) => setTimeout(resolve, 50))
	}
	throw new Error('Timed out waiting for the fake server')
}

export async function run(ctx) {
	// The harness profile is reused between runs, so the chat needs a unique title.
	const title = `Queue persist ${Date.now()}`
	const server = await startFakeModelServer({
		chunks: ['one', ' two', ' three', ' four', ' five', ' six', ' seven', ' eight'],
		delayMs: 120,
	})
	try {
		await ctx.open({ settings: localSettings(server.endpoint) })
		const { page } = ctx

		await page.locator('.composer__input').fill(title)
		await page.locator('button[aria-label="Submit"]').click()
		await page.waitForSelector('button[aria-label="Stop generating"]')

		await page.locator('.composer__input').fill('Queued survives reload')
		await page.locator('button[aria-label="Submit"]').click()
		await page.waitForSelector('.composer__queue')
		assert.equal(await page.locator('.composer__queue-item').count(), 1)

		// Reload while the turn is still running: the panel opens a fresh chat.
		await page.reload()
		await page.waitForSelector('.composer__input')
		// A new chat starts with an empty queue; the pending prompt belongs to the old one.
		assert.equal(await page.locator('.composer__queue').count(), 0)

		// Reopening the saved chat restores its queue, and the prompt runs right away.
		await page.locator('button[aria-label="Chat history"]').click()
		await page.locator('.history__main', { hasText: title }).click()

		await waitFor(() => server.requests.length >= 2)
		await page.waitForFunction(() => document.querySelectorAll('.message--user').length >= 2)
		const userTexts = await page.locator('.message--user .message__text').allTextContents()
		assert.equal(userTexts[0], title)
		assert.equal(userTexts[1], 'Queued survives reload')
		assert.equal(await page.locator('.composer__queue').count(), 0)
		assert.match(server.requests.at(-1).messages.at(-1).content, /Queued survives reload/)
	} finally {
		await server.close()
	}
}
