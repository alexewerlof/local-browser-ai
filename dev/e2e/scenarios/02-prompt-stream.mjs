import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '02-prompt-stream'

export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['Hello', ' from', ' the', ' fake', ' server', '.'] })
	try {
		await ctx.open({ settings: localSettings(server.endpoint) })
		const { page } = ctx

		await page.waitForSelector('.composer__input')
		await page.locator('.composer__input').fill('Summarize the page in one line.')
		await page.locator('button[aria-label="Send"]').click()

		await page.waitForFunction(() => document.body.innerText.includes('Hello from the fake server.'))

		const userText = await page.locator('.message--user .message__text').first().textContent()
		assert.match(userText, /Summarize the page/)

		const assistant = await page.locator('.message--assistant .markdown').first().textContent()
		assert.match(assistant, /Hello from the fake server\./)

		// Streaming finished: the composer is usable again.
		await page.waitForSelector('.message--assistant .message__footer')
		assert.equal(await page.locator('.composer__input').isEnabled(), true)

		assert.equal(server.requests.length, 1)
		const body = server.requests[0]
		assert.equal(body.model, 'fake-model')
		assert.equal(body.stream, true)
		assert.equal(body.messages.at(-1).role, 'user')
		assert.match(body.messages.at(-1).content, /Summarize the page/)
		// Usage from the final SSE chunk is surfaced next to the answer.
		assert.match(await page.locator('.message__footer').last().textContent(), /42 in \/ 7 out/)
	} finally {
		await server.close()
	}
}
