import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '42-composer-focus'

/**
 * The composer box is the prompt editor, not a frame around it: a click on its own chrome —
 * the space after the last chip — focuses the textarea with the caret at the end. Controls
 * inside the border keep their own click, an open menu is not prompt chrome, and the page
 * header above the border is its own area: a click there never hands the caret to the prompt.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['ok'] })
	try {
		await reallyRun(ctx, server)
	} finally {
		await server.close()
	}
}

async function reallyRun(ctx, server) {
	await ctx.open({ settings: localSettings(server.endpoint) })
	const { page } = ctx

	const input = page.locator('.composer__input')
	await page.waitForSelector('.app')
	await input.waitFor()

	const focused = () => page.evaluate(() => document.activeElement === document.querySelector('.composer__input'))
	const header = await page.locator('.page-list__head').boundingBox()
	const toolbar = await page.locator('.composer__toolbar').boundingBox()
	assert.ok(header && toolbar)

	assert.equal(await focused(), false)

	// The page header is not prompt chrome. It sits above the box border and owns its own
	// clicks — the count opens the list — so a click on it must leave the caret alone.
	const headerX = header.x + header.width / 3
	const headerY = header.y + header.height / 2
	await page.mouse.click(headerX, headerY)
	assert.equal(await focused(), false, 'the page header must not focus the prompt')

	// The gap after the last chip, at the trailing end of the toolbar.
	await page.mouse.click(toolbar.x + toolbar.width - 20, toolbar.y + toolbar.height / 2)
	assert.equal(await focused(), true, 'a click beside the chips must focus the prompt')

	// The click was not about placing the caret, so it goes after the text already there.
	// The target is the box's own top gutter: with text in the prompt the toolbar grows a
	// Submit button at its trailing end, so its free space is no longer a stable target.
	const box = await page.locator('.composer__box').boundingBox()
	assert.ok(box)
	await input.fill('hello')
	await page.evaluate(() => document.activeElement.blur())
	await page.mouse.click(box.x + box.width / 2, box.y + 3)
	assert.deepEqual(
		await page.evaluate(() => {
			const field = document.querySelector('.composer__input')
			return { start: field.selectionStart, end: field.selectionEnd, length: field.value.length }
		}),
		{ start: 5, end: 5, length: 5 },
	)

	// The same is true of the header with text in the prompt: it is a separate area, not a
	// way into the editor.
	await page.evaluate(() => document.activeElement.blur())
	assert.equal(await focused(), false)
	await page.mouse.click(headerX, headerY)
	assert.equal(await focused(), false, 'the page header must not take the caret either')

	// The resize line is not prompt chrome either: a drag on it keeps the caret where it was
	// instead of handing it to the prompt.
	await page.evaluate(() => document.activeElement.blur())
	assert.equal(await focused(), false)
	const resizer = await page.locator('.composer__resizer').boundingBox()
	assert.ok(resizer)
	await page.mouse.move(resizer.x + resizer.width / 2, resizer.y + resizer.height / 2)
	await page.mouse.down()
	await page.mouse.move(resizer.x + resizer.width / 2, resizer.y + resizer.height / 2 - 80, { steps: 6 })
	await page.mouse.up()
	await page.waitForSelector('.composer--sized')
	assert.equal(await focused(), false, 'a resize must not be taken by the prompt')

	// A menu is not prompt chrome either, so neither its chip nor its surface moves focus.
	await page.locator('.chip--model').click()
	await page.waitForSelector('.popover')
	assert.equal(await focused(), false, 'opening a menu must not focus the prompt')
	await page.keyboard.press('Escape')
	await page.waitForSelector('.popover', { state: 'detached' })

	// Sending from the button hands the caret back to the prompt: the next keystroke belongs
	// there, and the focus ring is drawn for exactly that. Without this the button would keep
	// focus after a send, the ring would go out, and typing would reach nothing.
	await page.locator('.composer__input').fill('A prompt sent with the button')
	await page.locator('[aria-label="Submit"]').click()
	assert.equal(await focused(), true, 'a send must leave the caret in the prompt')
	await page.waitForFunction(
		() => getComputedStyle(document.querySelector('.composer__box'), '::after').opacity === '1',
	)
}
