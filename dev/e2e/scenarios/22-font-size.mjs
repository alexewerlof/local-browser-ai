import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '22-font-size'

/**
 * The font-size setting is a multiplier on the type tokens, written to `<html>` so the panel
 * and the Settings page share it. It must survive a reload and never touch control geometry.
 */
export async function run(ctx) {
	const settings = localSettings('http://127.0.0.1:1/v1', {
		ui: { theme: 'light', submitKey: 'enter', fontSize: 'large' },
	})
	await ctx.open({ settings })
	const { page } = ctx

	await page.waitForSelector('.app')
	const panelScale = await page.evaluate(() => document.documentElement.style.getPropertyValue('--text-scale'))
	assert.equal(panelScale, '1.25')

	// 13px base * 1.25. Spacing and control heights keep their designed pixels.
	const composerSize = await page
		.locator('.composer__input')
		.evaluate((element) => getComputedStyle(element).fontSize)
	assert.equal(composerSize, '16.25px')

	// The settings page reads the same tokens, so its own type follows the choice.
	await ctx.openSettings({ settings })
	await page.waitForSelector('.settings')
	assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--text-scale')), '1.25')
	assert.equal(
		await page
			.locator('.field__label')
			.first()
			.evaluate((element) => getComputedStyle(element).fontSize),
		'16.25px',
	)

	// The Appearance section carries the control; picking a value applies it immediately.
	await page.locator('.settings__nav-item:has-text("Appearance")').click()
	const fontRow = page.locator('.field', { hasText: 'Font size' })
	await fontRow.locator('select').selectOption('very-large')
	await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--text-scale') === '1.5')
	// Settings persist with a short debounce; wait for the write, not just the render.
	await page.waitForFunction(() => window.__LB_AI_TEST__.currentSettings()?.ui?.fontSize === 'very-large')

	const stored = await page.evaluate(() => window.__LB_AI_TEST__.readSettings())
	assert.equal(stored.ui.fontSize, 'very-large')

	// Reload: the choice comes back from storage and is applied again on boot.
	await page.reload()
	await page.waitForSelector('.settings')
	assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--text-scale')), '1.5')
}
