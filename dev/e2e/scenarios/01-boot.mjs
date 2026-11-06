import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '01-boot'

export async function run(ctx) {
	await ctx.open({ settings: localSettings('http://127.0.0.1:1/v1') })
	const { page } = ctx

	await page.waitForSelector('.app')
	await page.waitForSelector('.composer__input')

	// The header shows the conversation, not the extension identity: Chrome's
	// side panel already renders the extension name above it.
	assert.equal(await page.locator('.header__name').count(), 0)
	assert.equal(await page.locator('.header__logo').count(), 0)
	assert.equal(await page.locator('.header__title').textContent(), 'New chat')

	assert.equal(await page.locator('.empty__title').isVisible(), true)
	assert.match(await page.locator('.empty__subtitle').textContent(), /Right-click any page/i)

	// The model chip reflects the configured model.
	assert.match(await page.locator('.chip--model').textContent(), /fake-model/)

	// No page is in the chat, so the strip above the prompt says how to add one.
	assert.match(await page.locator('.page-list').textContent(), /Add this page to chat/i)

	// The context meter is present even before a page is added.
	assert.equal(await page.locator('.meter').isVisible(), true)
	assert.match(await page.locator('.meter__label').textContent(), /\/ 32k/)
}
