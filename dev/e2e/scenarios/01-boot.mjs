import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '01-boot'

export async function run(ctx) {
	await ctx.open({ settings: localSettings('http://127.0.0.1:1/v1') })
	const { page } = ctx

	await page.waitForSelector('.app')
	await page.waitForSelector('.composer__input')

	const header = await page.locator('.header__name').textContent()
	assert.equal(header, 'Local Browser AI')

	assert.equal(await page.locator('.empty__title').isVisible(), true)
	assert.match(await page.locator('.empty__subtitle').textContent(), /click the extension icon/i)

	// The model chip reflects the configured model.
	assert.match(await page.locator('.chip--model').textContent(), /fake-model/)

	// The context meter is present even before a page is attached.
	assert.equal(await page.locator('.meter').isVisible(), true)
	assert.match(await page.locator('.meter__label').textContent(), /\/ 32k/)
}
