import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '42-composer-focus'

/**
 * The composer box is the prompt editor, not a frame around it: a click on its own chrome
 * — the empty gap in the topbar, the space after the last chip — focuses the textarea
 * with the caret at the end. Controls inside the border keep their own click, and an open
 * menu is not prompt chrome.
 */
export async function run(ctx) {
	await ctx.open({ settings: localSettings('http://127.0.0.1:1/v1') })
	const { page } = ctx

	const input = page.locator('.composer__input')
	await page.waitForSelector('.app')
	await input.waitFor()

	const focused = () => page.evaluate(() => document.activeElement === document.querySelector('.composer__input'))
	const topbar = await page.locator('.composer__topbar').boundingBox()
	const toolbar = await page.locator('.composer__toolbar').boundingBox()
	assert.ok(topbar && toolbar)

	assert.equal(await focused(), false)

	// The free space in the topbar, between the page count and the Expand toggle.
	await page.mouse.click(topbar.x + topbar.width - 40, topbar.y + topbar.height / 2)
	assert.equal(await focused(), true, 'a click on the topbar chrome must focus the prompt')

	// The gap after the last chip, at the trailing end of the toolbar.
	await page.evaluate(() => document.activeElement.blur())
	assert.equal(await focused(), false)
	await page.mouse.click(toolbar.x + toolbar.width - 20, toolbar.y + toolbar.height / 2)
	assert.equal(await focused(), true, 'a click beside the chips must focus the prompt')

	// The click was not about placing the caret, so it goes after the text already there.
	await input.fill('hello')
	await page.evaluate(() => document.activeElement.blur())
	await page.mouse.click(topbar.x + topbar.width - 40, topbar.y + topbar.height / 2)
	assert.deepEqual(
		await page.evaluate(() => {
			const field = document.querySelector('.composer__input')
			return { start: field.selectionStart, end: field.selectionEnd, length: field.value.length }
		}),
		{ start: 5, end: 5, length: 5 },
	)

	// Controls keep their own click: Expand still expands instead of focusing the prompt.
	await page.locator('button[aria-label="Expand"]').click()
	await page.waitForSelector('.composer--expanded')
	assert.equal(await focused(), false, 'a button click must not be taken by the prompt')

	// A menu is not prompt chrome either, so neither its chip nor its surface moves focus.
	await page.locator('.chip--model').click()
	await page.waitForSelector('.popover--fill')
	assert.equal(await focused(), false, 'opening a menu must not focus the prompt')
	await page.keyboard.press('Escape')
	await page.waitForSelector('.popover', { state: 'detached' })
}
