import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '17-math'

/** Display math arrives in pieces and is typeset once the plugin chunk is loaded. */
export async function run(ctx) {
	const server = await startFakeModelServer({
		chunks: ['The gap is ', '$$\\text{360,000}', ' - \\text{240,000}', ' = \\text{120,000}$$', ' per year.'],
	})
	try {
		await ctx.open({ settings: localSettings(server.endpoint) })
		const { page } = ctx

		await page.locator('.composer__input').fill('How big is the gap?')
		await page.locator('button[aria-label="Submit"]').click()

		// The KaTeX chunk loads on demand, so the first render is plain text.
		await page.waitForSelector('.message--assistant .katex', { timeout: 20000 })

		const markdown = page.locator('.message--assistant .markdown').first()
		const text = await markdown.innerText()
		assert.doesNotMatch(text, /\$\$/, 'the delimiters are consumed by the renderer')
		assert.match(text, /120,000/)
		assert.match(text, /per year\./)
	} finally {
		await server.close()
	}
}
