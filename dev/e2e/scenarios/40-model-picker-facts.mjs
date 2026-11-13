import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '40-model-picker-facts'

/**
 * The model picker shows what Settings → Model Providers shows about each model — modalities,
 * context / max output and reasoning — in two lines per row. The menu hangs above the model
 * chip with its trailing edge on the panel's, keeping a chip menu's width instead of
 * stretching across the composer box.
 */
export async function run(ctx) {
	const settings = localSettings('http://127.0.0.1:1/v1', {
		providers: [
			{
				id: 'local',
				label: 'Fake local server',
				baseURL: 'http://127.0.0.1:1/v1',
				apiKey: '',
				models: ['gemma-4-12B-it', 'Qwen3.6-27B-MTP', 'handy-computer/parakeet-unified-en-0.6'],
				modelDetails: [
					{
						id: 'gemma-4-12B-it',
						contextWindow: 65_536,
						maxOutputTokens: 4096,
						inputModalities: ['text', 'image'],
						outputModalities: ['text'],
						state: 'loaded',
					},
				],
			},
		],
		defaultModel: { providerId: 'local', modelId: 'gemma-4-12B-it' },
	})
	await ctx.open({ settings })
	const { page } = ctx

	await page.locator('.model-menu__trigger').click()
	await page.waitForSelector('.popover')

	const rows = page.locator('.popover__model')
	assert.equal(await rows.count(), 3)

	// What the server reported is shown as a fact: no estimate mark.
	const reported = rows.filter({ hasText: 'gemma-4-12B-it' })
	assert.equal(await reported.locator('.popover__item-token').textContent(), '66k / 4.1k')
	assert.equal(
		await reported.locator('.popover__item-modalities').getAttribute('aria-label'),
		'Input: text, image · Output: text',
	)
	assert.equal(await reported.locator('.popover__item-reasoning').count(), 0)

	// The row's state: the server has it loaded, and it is the default chat-start model. Both
	// are icons on the name's line; the row's tint alone says which model is in use.
	assert.equal(await reported.locator('.popover__item-loaded').getAttribute('aria-label'), 'Loaded in the server')
	assert.equal(await reported.locator('.popover__item-star--on').getAttribute('aria-label'), 'Default model')
	assert.equal(await reported.locator('button.popover__item-star').count(), 0)
	assert.equal(await rows.filter({ hasText: 'Qwen3.6-27B-MTP' }).locator('.popover__item-loaded').count(), 0)

	// Every other row offers the same star as a button, so the default is set from here.
	const offer = page.locator('button[aria-label="Make Qwen3.6-27B-MTP the default model"]')
	assert.equal(await offer.count(), 1)
	await offer.click()
	await page.waitForFunction(
		() => window.__LB_AI_TEST__.currentSettings()?.defaultModel?.modelId === 'Qwen3.6-27B-MTP',
	)
	// The default moved, the menu stayed open, and this chat's model did not change.
	assert.equal(await page.locator('.popover').count(), 1)
	assert.match(await page.locator('.model-menu__trigger').textContent(), /gemma-4-12B-it/)
	assert.equal(await rows.filter({ hasText: 'gemma-4-12B-it' }).locator('button.popover__item-star').count(), 1)

	// The model's name has the first line to itself; the figures start where it does, on the
	// second line, with the capability glyphs after them.
	const name = await reported.locator('.popover__item-main').boundingBox()
	const facts = await reported.locator('.popover__item-facts').boundingBox()
	const tokens = await reported.locator('.popover__item-token').boundingBox()
	assert.ok(name && facts && tokens)
	assert.ok(Math.abs(facts.x - name.x) <= 1, 'the facts line starts under the name')
	assert.ok(facts.y >= name.y + name.height, 'the facts sit on a line below the name')
	assert.ok(Math.abs(tokens.x - facts.x) <= 1, 'the figures lead the facts line')

	// qwen3 reasons, and the server said nothing else about it, so both figures are guesses.
	// The reasoning mark is a glyph like the modality ones, named only for a screen reader.
	const estimated = rows.filter({ hasText: 'Qwen3.6-27B-MTP' })
	assert.equal(await estimated.locator('.popover__item-token').textContent(), '~33k / ~4.1k')
	assert.equal(await estimated.locator('.popover__item-reasoning').textContent(), '')
	assert.equal(await estimated.locator('.popover__item-reasoning').getAttribute('aria-label'), 'Reasoning')
	assert.equal(await estimated.locator('.popover__item-muted').textContent(), '—')

	// The menu is the body of its bar item, exactly like the other four: flush with the item's
	// own top edge, its bottom corners square where the two meet, and hanging from the item's
	// own left edge rather than from the bar's trailing one.
	const menu = await page.locator('.popover').boundingBox()
	const chip = await page.locator('.model-menu__trigger').boundingBox()
	const menubar = await page.locator('.composer__menubar').boundingBox()
	const viewport = page.viewportSize()
	assert.ok(menu && chip && menubar && viewport)
	assert.ok(
		Math.abs(menu.y + menu.height - chip.y) <= 1,
		`the menu is ${menu.y + menu.height - chip.y}px off its item`,
	)
	assert.ok(
		Math.abs(menu.x - chip.x) <= 1,
		`the menu must start on the item's left edge, not ${menu.x - chip.x}px away`,
	)
	assert.ok(menu.x >= menubar.x, 'the menu stays inside the composer')
	assert.ok(menu.x + menu.width <= viewport.width, 'the menu stays inside the panel')
	assert.ok(menu.width <= 320, 'the menu is no wider than the other bar menus')

	// Picking a model still closes the menu and updates the chip.
	await rows.filter({ hasText: 'Qwen3.6-27B-MTP' }).locator('.popover__item--model').click()
	assert.equal(await page.locator('.popover').count(), 0)
	assert.match(await page.locator('.model-menu__trigger').textContent(), /Qwen3\.6-27B-MTP/)

	// On a side panel too narrow to hold the menu under the Model item, the panel is moved
	// back inside the screen instead of running past it — it keeps its own left edge whenever
	// there is room, which is what the check above proves at the normal width.
	await page.setViewportSize({ width: 340, height: 900 })
	await page.locator('.model-menu__trigger').click()
	await page.waitForSelector('.popover')
	const narrow = await page.locator('.popover').boundingBox()
	assert.ok(narrow)
	assert.ok(narrow.x >= -1, `the menu starts at ${narrow.x}px, off the left edge`)
	assert.ok(narrow.x + narrow.width <= 341, `the menu ends at ${narrow.x + narrow.width}px, past the panel`)
	assert.equal(await page.locator('.popover').count(), 1)
	await page.keyboard.press('Escape')
}
