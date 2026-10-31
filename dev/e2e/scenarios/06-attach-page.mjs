import assert from 'node:assert/strict'
import { exampleTab, localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '06-attach-page'

export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['Starter', ' is', ' 10 EUR.'] })
	try {
		// A toolbar click happened before the panel loaded, so the tab is claimed and
		// extracted during bootstrap.
		await ctx.open({ settings: localSettings(server.endpoint), tab: exampleTab })
		const { page } = ctx

		await page.waitForSelector('.attachment')
		assert.match(await page.locator('.attachment__title').textContent(), /Example Pricing/)
		assert.match(await page.locator('.attachment__meta').textContent(), /example\.com/)

		await page.locator('.composer__input').fill('How much is the starter plan?')
		await page.locator('button[aria-label="Send"]').click()
		await page.waitForFunction(() => document.body.innerText.includes('Starter is 10 EUR.'))

		// The attached page reached the model as system context.
		const system = server.requests[0].messages[0].content
		assert.match(system, /Attached page/)
		assert.match(system, /Starter plan costs 10 EUR per month/)

		// The meter reports a page segment once the page is in the prompt.
		await page.locator('.meter').click()
		const panelText = await page.locator('.popover').textContent()
		assert.match(panelText, /Example Pricing/)
		assert.match(panelText, /Attached page|whole page/i)
	} finally {
		await server.close()
	}
}
