import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '37-skill-search'

/**
 * The skills menu filters its list from a search row at the top — the model picker's
 * pattern — and the gear that opens Settings sits beside that field, not in a footer row.
 */
export async function run(ctx) {
	const settings = localSettings('http://127.0.0.1:1/v1')
	settings.skills = [
		{
			id: 'lighthouse',
			name: 'Lighthouse audit',
			description: 'Check accessibility of a page',
			prompt: 'Audit this page for accessibility problems.',
		},
		{
			id: 'risotto',
			name: 'Risotto',
			description: 'Write a cooking plan',
			prompt: 'Write a cooking plan for this recipe.',
		},
	]
	await ctx.open({ settings })
	const { page } = ctx

	const items = () => page.locator('.popover .popover__item-main').allTextContents()

	await page.locator('.chip:has-text("Skills")').click()
	await page.waitForSelector('.popover')
	// Both user skills are there, beside the built-ins that are always present.
	const all = await items()
	assert.ok(all.includes('Lighthouse audit'))
	assert.ok(all.includes('Risotto'))

	// The gear is in the header row, next to the search field, and there is no footer row.
	assert.equal(await page.locator('.popover__header button[aria-label="Manage skills"]').count(), 1)
	assert.equal(await page.locator('.popover__footer').count(), 0)

	// Search matches the name and the description, and reports an empty result honestly.
	const search = page.locator('.popover__header input')
	await search.fill('lighthouse')
	assert.deepEqual(await items(), ['Lighthouse audit'])

	await search.fill('cooking')
	assert.deepEqual(await items(), ['Risotto'])

	await search.fill('zzz')
	assert.deepEqual(await items(), [])
	assert.equal(await page.locator('.popover__empty').textContent(), 'No skills match.')

	// Picking from a filtered list still inserts the skill's prompt.
	await search.fill('lighthouse')
	await page.locator('.popover__item', { hasText: 'Lighthouse audit' }).click()
	assert.equal(await page.locator('.popover').count(), 0)
	assert.equal(
		await page.locator('textarea[aria-label="Message"]').inputValue(),
		'Audit this page for accessibility problems.',
	)
}
