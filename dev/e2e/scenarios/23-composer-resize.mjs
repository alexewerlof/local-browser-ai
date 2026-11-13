import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '23-composer-resize'

/**
 * The composer's top edge is a resize line: dragging it up grows the composer and lets the
 * textarea scroll inside it, so a long prompt gets room. The floor keeps every row around the
 * prompt at its natural height with one line of prompt, the ceiling keeps a sliver of
 * transcript on screen, and a double-click returns to the natural size.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['ok'], delayMs: 400 })
	try {
		await reallyRun(ctx, server)
	} finally {
		await server.close()
	}
}

async function reallyRun(ctx, server) {
	await ctx.open({ settings: localSettings(server.endpoint) })
	const { page } = ctx

	await page.waitForSelector('.app')
	await page.locator('.composer__input').waitFor()

	const measure = () =>
		page.evaluate(() => {
			const input = document.querySelector('.composer__input')
			const style = getComputedStyle(input)
			return {
				composer: document.querySelector('.composer').getBoundingClientRect().height,
				box: document.querySelector('.composer__box').getBoundingClientRect().height,
				input: input.clientHeight,
				line: Number.parseFloat(style.lineHeight),
				floor: Number.parseFloat(style.minHeight),
				scroll: input.scrollHeight,
				transcript: document.querySelector('.transcript').getBoundingClientRect().height,
			}
		})

	/** Grab the line at its middle and drag it by `offset` (negative is upwards). */
	const drag = async (offset) => {
		const line = await page.locator('.composer__resizer').boundingBox()
		assert.ok(line, 'the resize line must be on screen')
		const x = line.x + line.width / 2
		const y = line.y + line.height / 2
		await page.mouse.move(x, y)
		await page.mouse.down()
		await page.mouse.move(x, y + offset, { steps: 10 })
		await page.mouse.up()
	}

	const line = page.locator('.composer__resizer')
	const lineBox = await line.boundingBox()
	assert.ok(lineBox, 'the resize line must exist')

	// The strip is taller than the rule it paints, so the line is easy to catch.
	assert.ok(lineBox.height >= 8, `grab area is ${lineBox.height}px tall`)
	assert.equal(await line.getAttribute('role'), 'separator')
	assert.equal(await line.getAttribute('aria-orientation'), 'horizontal')
	assert.ok((await line.getAttribute('aria-label'))?.trim())

	// The cursor is what says the line can be dragged.
	const cursors = await page.evaluate(() => {
		const resizer = document.querySelector('.composer__resizer')
		const before = getComputedStyle(resizer, '::before')
		return { line: getComputedStyle(resizer).cursor, thickness: before.height, painted: before.content }
	})
	assert.equal(cursors.line, 'ns-resize')
	assert.equal(cursors.thickness, '2px', `the rule is ${cursors.thickness} thick`)

	// The line replaced the toggle: no Expand/Shrink button is left anywhere.
	assert.equal(await page.locator('button[aria-label="Expand"], button[aria-label="Shrink"]').count(), 0)
	assert.equal(await page.locator('.composer--sized, .composer--expanded').count(), 0)

	const natural = await measure()

	// An empty draft already shows three lines of room: the prompt opens tall enough to see a
	// paragraph take shape, rather than a single line that grows on the second keystroke.
	assert.ok(
		natural.input >= natural.line * 3 - 1,
		`the prompt is ${natural.input}px tall, less than three ${natural.line}px lines`,
	)
	assert.ok(natural.input >= natural.floor, 'the minimum is the floor the prompt may not lose')

	// A click on the line is not a drag.
	await page.mouse.move(lineBox.x + lineBox.width / 2, lineBox.y + lineBox.height / 2)
	await page.mouse.down()
	await page.mouse.up()
	await page.waitForTimeout(80)
	assert.ok(
		Math.abs((await measure()).composer - natural.composer) < 1,
		'a click on the line must not resize the composer',
	)

	// While the drag is in flight the pointer is told what it is doing: the rule turns
	// accent, every cursor under it becomes a resize arrow, and the prompt does not select
	// text under the pointer. Hovering already darkens the rule, so the line reads as
	// grabbable before the button goes down. Both colours are read once their transition has
	// settled — the rule animates, and a reading taken mid-fade says nothing.
	await page.mouse.move(10, 10)
	await page.waitForTimeout(250)
	const resting = await page.evaluate(
		() => getComputedStyle(document.querySelector('.composer__resizer'), '::before').backgroundColor,
	)
	const start = await page.locator('.composer__resizer').boundingBox()
	const startX = start.x + start.width / 2
	const startY = start.y + start.height / 2
	await page.mouse.move(startX, startY)
	await page.waitForTimeout(250)
	const hovered = await page.evaluate(
		() => getComputedStyle(document.querySelector('.composer__resizer'), '::before').backgroundColor,
	)
	await page.mouse.down()
	await page.mouse.move(startX, startY - 120, { steps: 6 })
	await page.waitForTimeout(250)
	const during = await page.evaluate(() => ({
		resizing: document.querySelector('.composer--resizing') !== null,
		cursor: getComputedStyle(document.querySelector('.composer__input')).cursor,
		rule: getComputedStyle(document.querySelector('.composer__resizer'), '::before').backgroundColor,
		selection: String(window.getSelection()),
	}))
	// Back down to where the gesture started before letting go.
	await page.mouse.move(startX, startY, { steps: 6 })
	await page.mouse.up()
	// Back where it started, so the next gesture begins from the natural height again.
	assert.ok(Math.abs((await measure()).composer - natural.composer) < 3, 'the drag did not come back')
	assert.notEqual(hovered, resting, 'hovering the line must darken it')
	assert.notEqual(during.rule, hovered, 'the rule turns accent while the line is dragged')
	assert.equal(during.resizing, true, 'the composer reports the drag')
	assert.equal(during.cursor, 'ns-resize', 'the whole composer keeps the resize cursor during a drag')
	assert.equal(during.selection, '', 'a drag must not select the prompt text')

	// Dragging up grows the composer by the distance dragged.
	await drag(-300)
	await page.waitForSelector('.composer--sized')
	const grown = await measure()
	assert.ok(
		Math.abs(grown.composer - (natural.composer + 300)) < 4,
		`${grown.composer}px is not ${natural.composer}px + 300`,
	)
	assert.equal(
		await line.getAttribute('aria-valuenow'),
		String(Math.round(grown.composer)),
		'the line reports the height it set',
	)

	// A long draft scrolls inside the textarea instead of growing the box: the 240px cap
	// belongs to the natural size only.
	const longDraft = Array.from({ length: 60 }, (_, index) => `line ${index + 1}`).join('\n')
	await page.locator('.composer__input').fill(longDraft)
	const scrolled = await measure()
	assert.ok(scrolled.input > 300, `textarea is only ${scrolled.input}px tall`)
	assert.ok(scrolled.scroll > scrolled.input, 'the long draft should scroll inside the textarea')
	assert.ok(Math.abs(scrolled.box - grown.box) < 2, 'the box must not grow with the draft')

	// Back to the floor first, so the drag up to the ceiling can start from the bottom of
	// the panel and stay inside the viewport.
	await drag(2000)
	const floored = await page.evaluate(() => {
		const composer = document.querySelector('.composer').getBoundingClientRect()
		const menubar = document.querySelector('.composer__menubar').getBoundingClientRect()
		const meta = document.querySelector('.composer__meta').getBoundingClientRect()
		const input = document.querySelector('.composer__input')
		return {
			composer: composer.height,
			menubarInside: menubar.top >= composer.top - 1 && menubar.bottom <= composer.bottom + 1,
			metaInside: meta.top >= composer.top - 1 && meta.bottom <= composer.bottom + 1,
			input: input.clientHeight,
			floor: Number.parseFloat(getComputedStyle(input).minHeight),
			scrolls: input.scrollHeight > input.clientHeight,
		}
	})
	assert.ok(floored.composer < grown.composer, `${floored.composer}px did not shrink`)
	assert.ok(floored.menubarInside, 'the floor must not clip the menu bar')
	assert.ok(floored.metaInside, 'the floor must not clip the meta row')
	// The floor is the prompt's own minimum — three lines — and the rest of the draft scrolls
	// rather than fitting.
	assert.ok(floored.input >= floored.floor, `textarea is ${floored.input}px tall at the floor`)
	assert.ok(floored.scrolls, 'the long draft must scroll at the floor instead of being cut off')

	// Dragging far up stops at the ceiling: a sliver of transcript always stays.
	await drag(-900)
	const maxed = await measure()
	assert.ok(maxed.transcript >= 95, `transcript is only ${maxed.transcript}px at the ceiling`)
	assert.ok(maxed.composer > floored.composer, 'the drag must keep growing until the ceiling')
	assert.ok(maxed.transcript < 130, `transcript is ${maxed.transcript}px, the ceiling is too low`)

	// Two clicks inside the double-click window forget the drag.
	await line.dblclick()
	await page.waitForSelector('.composer--sized', { state: 'detached' })
	assert.equal(await line.getAttribute('aria-valuenow'), null)
	// The natural size caps a long draft at 240px again, and the text is kept.
	assert.ok((await measure()).input <= 241, 'the natural 240px cap is back')
	assert.equal(await page.locator('.composer__input').inputValue(), longDraft)

	// The natural size is exactly what the auto-grow produced before any drag.
	await page.locator('.composer__input').fill('')
	await page.waitForFunction(
		(height) => Math.abs(document.querySelector('.composer').getBoundingClientRect().height - height) < 2,
		natural.composer,
	)

	// A menu is not a row: the Pages menu floats over the transcript, so opening it on a sized
	// composer moves neither the composer nor the prompt.
	await drag(-300)
	await page.waitForSelector('.composer--sized')
	const beforeMenu = await measure()
	await page.locator('.pages-menu__trigger').click()
	await page.waitForSelector('.popover')
	const withMenu = await measure()
	assert.equal(withMenu.composer, beforeMenu.composer, 'a menu must not resize the composer')
	assert.equal(withMenu.box, beforeMenu.box, 'a menu must not resize the prompt')
	assert.equal(withMenu.input, beforeMenu.input, 'the textarea keeps its height')
	await page.keyboard.press('Escape')

	// A row that really is above the prompt — a queued prompt — is paid for by the transcript:
	// the composer grows upward and the editor keeps its height, so a composer at its floor
	// never loses the textarea.
	await page.locator('.composer__input').fill('first')
	await page.locator('[aria-label="Submit"]').click()
	await page.locator('.composer__input').fill('queued')
	await page.locator('[aria-label="Submit"]').click()
	await page.waitForSelector('.composer__queue-item')
	const withQueue = await measure()
	assert.ok(withQueue.composer > beforeMenu.composer + 20, 'the composer must grow upward')
	assert.ok(Math.abs(withQueue.box - beforeMenu.box) < 2, 'the prompt must keep its height')
	assert.equal(withQueue.input, beforeMenu.input, 'the textarea must not shrink')
	assert.ok(withQueue.transcript < beforeMenu.transcript, 'the transcript is what gives way')

	// Taking the row back gives that room to the transcript again.
	await page.locator('.composer__queue-remove').click()
	await page.waitForFunction(() => !document.querySelector('.composer__queue-item'))
	await page.waitForFunction(
		(height) => Math.abs(document.querySelector('.composer').getBoundingClientRect().height - height) < 2,
		beforeMenu.composer,
	)

	// The dragged height is a view state: a reloaded panel starts at the natural size.
	await page.reload()
	await page.waitForSelector('.app')
	assert.equal(await page.locator('.composer--sized').count(), 0)
}
