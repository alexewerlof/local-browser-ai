import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '23-composer-expand'

const VIEWPORT_HEIGHT = 1100

/**
 * The prompt box has a top bar with an Expand/Shrink toggle. Expanding grows the whole
 * composer to most of the panel height (a sliver of transcript stays visible) and lets the
 * textarea scroll internally; shrinking returns to the auto-growing normal size.
 */
export async function run(ctx) {
	await ctx.open({ settings: localSettings('http://127.0.0.1:1/v1') })
	const { page } = ctx

	await page.waitForSelector('.app')

	// The bar lives inside the box border, otherwise it would not read as part of the editor.
	assert.equal(await page.locator('.composer__box > .composer__topbar').count(), 1)
	assert.equal(await page.locator('.composer__topbar button[aria-label="Expand"]').isVisible(), true)
	assert.equal(await page.locator('.composer__topbar button[aria-label="Shrink"]').count(), 0)
	assert.equal(
		await page.locator('.composer__topbar button[aria-label="Expand"]').getAttribute('aria-expanded'),
		'false',
	)
	assert.equal(await page.locator('.composer--expanded').count(), 0)

	const collapsed = await page.evaluate(() => ({
		composer: document.querySelector('.composer').getBoundingClientRect().height,
		box: document.querySelector('.composer__box').getBoundingClientRect().height,
	}))

	await page.locator('.composer__topbar button[aria-label="Expand"]').click()
	await page.waitForSelector('.composer--expanded')
	assert.equal(await page.locator('.composer__topbar button[aria-label="Shrink"]').isVisible(), true)
	assert.equal(await page.locator('.composer__topbar button[aria-label="Expand"]').count(), 0)
	assert.equal(
		await page.locator('.composer__topbar button[aria-label="Shrink"]').getAttribute('aria-expanded'),
		'true',
	)

	const expanded = await page.evaluate(() => ({
		composer: document.querySelector('.composer').getBoundingClientRect().height,
		box: document.querySelector('.composer__box').getBoundingClientRect().height,
		transcript: document.querySelector('.transcript').getBoundingClientRect().height,
	}))
	// 75% of the panel, minus the composer's own padding.
	assert.ok(expanded.composer > VIEWPORT_HEIGHT * 0.7, `composer ${expanded.composer}px is not expanded`)
	assert.ok(expanded.composer < VIEWPORT_HEIGHT * 0.8, `composer ${expanded.composer}px overshoots`)
	assert.ok(expanded.box > collapsed.box * 3, `${expanded.box}px vs ${collapsed.box}px collapsed`)
	// The rest of the panel still shows the session.
	assert.ok(expanded.transcript > 80, `transcript ${expanded.transcript}px is too small`)
	assert.ok(expanded.transcript < VIEWPORT_HEIGHT * 0.3, `transcript ${expanded.transcript}px is too tall`)

	// A long draft scrolls inside the textarea instead of growing the box further.
	const longDraft = Array.from({ length: 60 }, (_, index) => `line ${index + 1}`).join('\n')
	await page.locator('.composer__input').fill(longDraft)
	const scrolled = await page.evaluate(() => {
		const input = document.querySelector('.composer__input')
		return {
			client: input.clientHeight,
			scroll: input.scrollHeight,
			box: document.querySelector('.composer__box').getBoundingClientRect().height,
		}
	})
	// The normal 240px cap does not apply while expanded.
	assert.ok(scrolled.client > 300, `textarea is only ${scrolled.client}px tall`)
	assert.ok(scrolled.scroll > scrolled.client, 'the long draft should scroll inside the textarea')
	assert.ok(Math.abs(scrolled.box - expanded.box) < 2, 'the box must not grow with the draft')

	await page.locator('.composer__topbar button[aria-label="Shrink"]').click()
	await page.waitForSelector('.composer--expanded', { state: 'detached' })
	const shrunk = await page.evaluate(() => ({
		composer: document.querySelector('.composer').getBoundingClientRect().height,
		input: document.querySelector('.composer__input').clientHeight,
	}))
	// Back to the auto-grow cap (240px for a long draft), and the text is kept.
	assert.ok(shrunk.composer < expanded.composer * 0.6, `${shrunk.composer}px did not shrink`)
	assert.ok(shrunk.input <= 241, `textarea is ${shrunk.input}px tall after shrinking`)
	assert.equal(await page.locator('.composer__input').inputValue(), longDraft)
	assert.equal(await page.locator('.composer__topbar button[aria-label="Expand"]').isVisible(), true)

	// An empty draft gives back the original height exactly.
	await page.locator('.composer__input').fill('')
	await page.waitForFunction(
		(height) => Math.abs(document.querySelector('.composer').getBoundingClientRect().height - height) < 2,
		collapsed.composer,
	)

	// Expanded is a transient view state: a reloaded panel starts at the normal size.
	await page.locator('.composer__topbar button[aria-label="Expand"]').click()
	await page.waitForSelector('.composer--expanded')
	await page.reload()
	await page.waitForSelector('.app')
	assert.equal(await page.locator('.composer--expanded').count(), 0)
	assert.equal(await page.locator('.composer__topbar button[aria-label="Expand"]').isVisible(), true)
}
