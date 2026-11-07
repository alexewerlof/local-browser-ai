import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '19-prompt-queue'

/** Poll a Node-side condition (server state is not visible to the page). */
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

		// An empty draft renders no Submit button, so a busy composer shows Stop alone.
		await page.waitForSelector('button[aria-label="Stop generating"]')
		assert.equal(await page.locator('button[aria-label="Submit"]').count(), 0)

		// While the answer streams the user can stop it *and* submit the next prompt.
		await page.locator('.composer__input').fill('Second prompt')
		assert.equal(await page.locator('button[aria-label="Submit"]').isVisible(), true)
		await page.locator('button[aria-label="Submit"]').click()
		await page.locator('.composer__input').fill('Third prompt')
		await page.locator('button[aria-label="Submit"]').click()

		await page.waitForSelector('.composer__queue')
		// A row appears only once its write has landed, so wait for both.
		await page.waitForFunction(() => document.querySelectorAll('.composer__queue-item').length === 2)
		assert.match(await page.locator('.composer__queue').textContent(), /Second prompt/)
		assert.match(await page.locator('.composer__queue').textContent(), /Third prompt/)
		// Submitting a queued prompt clears the draft like a normal submit does.
		assert.equal(await page.locator('.composer__input').inputValue(), '')
		// Queued prompts wait for the loop; nothing new has been requested yet.
		assert.equal(server.requests.length, 1)

		// Removing a queued prompt puts its text back in the composer for editing.
		await page.locator('.composer__queue-item', { hasText: 'Third prompt' }).locator('button').click()
		await page.waitForFunction(() => document.querySelector('.composer__input').value === 'Third prompt')
		await page.waitForFunction(() => document.querySelectorAll('.composer__queue-item').length === 1)
		assert.match(await page.locator('.composer__queue').textContent(), /Second prompt/)
		// Drop it: it was only removed to prove the draft is restored.
		await page.locator('.composer__input').fill('')

		// When the first turn ends, the queued prompt runs as if it had been submitted.
		await waitFor(() => server.requests.length === 2)
		await page.waitForFunction(() => document.querySelectorAll('.message--user').length === 2)
		const userTexts = await page.locator('.message--user .message__text').allTextContents()
		assert.deepEqual(userTexts, ['First prompt', 'Second prompt'])
		assert.equal(await page.locator('.composer__queue').count(), 0)

		const body = server.requests[1]
		assert.equal(body.messages.at(-1).role, 'user')
		assert.match(body.messages.at(-1).content, /Second prompt/)
	} finally {
		await server.close()
	}
}
