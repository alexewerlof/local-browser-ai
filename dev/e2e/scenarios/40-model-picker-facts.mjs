import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '40-model-picker-facts'

/**
 * The model picker shows what Settings → Providers shows about each model — modalities,
 * context / max output and reasoning — in two lines per row. The menu also spans the
 * composer box instead of hanging off the model chip, which is what used to push its right
 * edge past the panel.
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
					},
				],
			},
		],
		defaultModel: { providerId: 'local', modelId: 'gemma-4-12B-it' },
	})
	await ctx.open({ settings })
	const { page } = ctx

	await page.locator('.chip--model').click()
	await page.waitForSelector('.popover--fill')

	const rows = page.locator('.popover__item--model')
	assert.equal(await rows.count(), 3)

	// What the server reported is shown as a fact: no estimate mark.
	const reported = rows.filter({ hasText: 'gemma-4-12B-it' })
	assert.equal(await reported.locator('.popover__item-token').textContent(), '66k / 4.1k')
	assert.equal(
		await reported.locator('.popover__item-modalities').getAttribute('aria-label'),
		'Input: text, image · Output: text',
	)
	assert.equal(await reported.locator('.popover__item-reasoning').count(), 0)

	// qwen3 reasons, and the server said nothing else about it, so both figures are guesses.
	const estimated = rows.filter({ hasText: 'Qwen3.6-27B-MTP' })
	assert.equal(await estimated.locator('.popover__item-token').textContent(), '~33k / ~4.1k')
	assert.equal(await estimated.locator('.popover__item-reasoning').textContent(), 'Reasoning')
	assert.equal(await estimated.locator('.popover__item-muted').textContent(), '—')

	// The menu fills the composer box with a gutter inside it, instead of starting at the
	// chip and running past the panel's right edge.
	const popover = await page.locator('.popover--fill').boundingBox()
	const box = await page.locator('.composer__box').boundingBox()
	const viewport = page.viewportSize()
	assert.ok(popover && box && viewport)
	assert.ok(popover.x > box.x, 'the menu starts inside the composer box')
	assert.ok(popover.x + popover.width < box.x + box.width, 'the right edge is not clipped')
	assert.ok(popover.x + popover.width <= viewport.width, 'the menu stays inside the panel')
	assert.ok(popover.width > box.width * 0.8, 'the menu uses the available width')

	// Picking a model still closes the menu and updates the chip.
	await rows.filter({ hasText: 'Qwen3.6-27B-MTP' }).click()
	assert.equal(await page.locator('.popover').count(), 0)
	assert.match(await page.locator('.chip--model').textContent(), /Qwen3\.6-27B-MTP/)
}
