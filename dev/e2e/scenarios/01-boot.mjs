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

	// The model menu states the model in use, on the bar itself.
	assert.match(await page.locator('.model-menu__trigger').textContent(), /fake-model/)

	// The composer's menu bar is there before anything is added: Pages says how many pages the
	// chat holds, and its menu is where the add lives.
	assert.equal((await page.locator('.composer__menubar .menu-item').count()) >= 3, true)
	assert.equal(await page.locator('.pages-menu__trigger .menu-item__count').textContent(), '0')
	await page.locator('.pages-menu__trigger').click()
	assert.equal(await page.locator('.popover__empty').textContent(), 'No pages in this chat.')
	assert.equal(await page.locator('.pages-menu__add').getAttribute('aria-label'), 'Add page to chat')
	await page.keyboard.press('Escape')
	assert.equal(await page.locator('.popover').count(), 0)

	// The context meter is present even before a page is added.
	assert.equal(await page.locator('.meter').isVisible(), true)
	assert.match(await page.locator('.meter__label').textContent(), /\/ 32k/)
}
