import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '42-composer-focus'

/**
 * The prompt band is the composer's click surface, not a frame around it: a click on its own
 * padding — above the first line, below the last — focuses the textarea with the caret at the
 * end. The menus above it and the actions below it own their own clicks, an open menu is not
 * prompt chrome, and the resize line is not either.
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
	const menubar = await page.locator('.composer__menubar').boundingBox()
	assert.ok(menubar)

	assert.equal(await focused(), false)

	// The menu bar is not prompt chrome: it sits above the prompt band and owns its own
	// clicks — Pages opens a menu — so a click on the bar must leave the caret alone.
	const barX = menubar.x + menubar.width / 2
	const barY = menubar.y + menubar.height / 2
	await page.mouse.click(barX, barY)
	assert.equal(await focused(), false, 'the menu bar must not focus the prompt')

	// The prompt band's own padding is prompt chrome: a click there hands over the caret.
	// The box is measured per click, because the band moves when the composer's height does.
	const clickBand = async () => {
		const box = await page.locator('.composer__box').boundingBox()
		assert.ok(box)
		await page.mouse.click(box.x + box.width / 2, box.y + 1)
	}

	await clickBand()
	assert.equal(await focused(), true, 'a click on the band must focus the prompt')

	// The click was not about placing the caret, so it goes after the text already there.
	await input.fill('hello')
	await page.evaluate(() => document.activeElement.blur())
	await clickBand()
	assert.deepEqual(
		await page.evaluate(() => {
			const field = document.querySelector('.composer__input')
			return { start: field.selectionStart, end: field.selectionEnd, length: field.value.length }
		}),
		{ start: 5, end: 5, length: 5 },
	)

	// The same is true of the bar with text in the prompt: it is a separate area, not a way
	// into the editor.
	await page.evaluate(() => document.activeElement.blur())
	assert.equal(await focused(), false)
	await page.mouse.click(barX, barY)
	assert.equal(await focused(), false, 'the menu bar must not take the caret either')

	// The row under the prompt belongs to the actions, not to the prompt.
	const meta = await page.locator('.composer__meta').boundingBox()
	assert.ok(meta)
	await page.mouse.click(meta.x + 2, meta.y + meta.height / 2)
	assert.equal(await focused(), false, 'the meta row must not take the caret')

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

	// A menu is not prompt chrome either, so neither its item nor its surface moves focus.
	await page.locator('.model-menu__trigger').click()
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
