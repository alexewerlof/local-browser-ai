import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '03-prompt-abort'

export async function run(ctx) {
	const server = await startFakeModelServer({
		chunks: ['one', ' two', ' three', ' four', ' five', ' six', ' seven', ' eight'],
		delayMs: 120,
	})
	try {
		await ctx.open({ settings: localSettings(server.endpoint) })
		const { page } = ctx

		await page.locator('.composer__input').fill('Count slowly.')
		await page.locator('button[aria-label="Submit"]').click()

		// Wait until the stream has produced something, then stop it.
		await page.waitForFunction(() => document.body.innerText.includes('one two'))
		await page.locator('button[aria-label="Stop generating"]').click()

		await page.waitForFunction(() => document.body.innerText.includes('stopped'))

		const text = await page.locator('.message--assistant .markdown').first().textContent()
		assert.ok(text.length > 0, 'partial answer should be kept')
		assert.doesNotMatch(text, /eight/)

		// The partial answer is no longer streaming and the composer recovered: the Stop
		// button goes away, and an empty draft renders no Submit button at all.
		assert.equal(await page.locator('.composer__input').isEnabled(), true)
		await page.waitForSelector('button[aria-label="Stop generating"]', { state: 'detached' })
		assert.equal(await page.locator('button[aria-label="Submit"]').count(), 0)
		await page.locator('.composer__input').fill('Next question')
		assert.equal(await page.locator('button[aria-label="Submit"]').isVisible(), true)
	} finally {
		await server.close()
	}
}
