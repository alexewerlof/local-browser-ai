import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '24-settings-routes'

/**
 * The rail section lives in the fragment, so a refresh or a link keeps the section the user
 * was reading instead of dropping back to General.
 */
export async function run(ctx) {
	await ctx.openSettings({ settings: localSettings('http://127.0.0.1:1/v1') })
	const { page } = ctx

	// The bare URL is the landing route, and it stays bare.
	assert.equal(await page.evaluate(() => location.hash), '')
	assert.equal(await page.locator('.settings__nav-item--active').textContent(), 'General')

	// Choosing a section writes it to the fragment.
	await page.locator('.settings__nav-item:has-text("Templates")').click()
	await page.waitForSelector('.settings__content >> text=Prompt templates are saved prompts')
	assert.equal(await page.evaluate(() => location.hash), '#templates')

	// A refresh keeps the section.
	await page.reload()
	await page.waitForSelector('.settings')
	assert.equal(await page.evaluate(() => location.hash), '#templates')
	assert.equal(await page.locator('.settings__nav-item--active').textContent(), 'Templates')
	assert.equal(await page.locator('.settings__content >> text=Prompt templates are saved prompts').count(), 1)

	// A second section is a history entry, so Back returns to the previous one.
	await page.locator('.settings__nav-item:has-text("Memory")').click()
	await page.waitForSelector('.memory-empty')
	assert.equal(await page.evaluate(() => location.hash), '#memory')
	await page.goBack()
	await page.waitForSelector('.settings__content >> text=Prompt templates are saved prompts')
	assert.equal(await page.evaluate(() => location.hash), '#templates')
	assert.equal(await page.locator('.settings__nav-item--active').textContent(), 'Templates')

	// A deep link opens its section directly, which is what the panel's gears use.
	const base = page.url().split('#')[0]
	await page.goto(`${base}#mcp`)
	await page.waitForSelector('.settings')
	// `#mcp` had its own page before the merge; the alias lands on Tools and the fragment
	// is rewritten, so the URL always names the section on screen.
	assert.equal(await page.locator('.settings__nav-item--active').textContent(), 'Tools')
	assert.equal(await page.evaluate(() => location.hash), '#tools')

	// The same for the retired Models page, whose model list now lives in the provider editor.
	await page.goto(`${base}#models`)
	await page.waitForSelector('.settings')
	assert.equal(await page.locator('.settings__nav-item--active').textContent(), 'Model Providers')
	assert.equal(await page.evaluate(() => location.hash), '#providers')

	// The section was called Skills, then Prompt templates, before its caption was shortened;
	// both fragments still land there and are rewritten, so the URL names the section on screen.
	await page.goto(`${base}#skills`)
	await page.waitForSelector('.settings')
	assert.equal(await page.locator('.settings__nav-item--active').textContent(), 'Templates')
	assert.equal(await page.evaluate(() => location.hash), '#templates')

	await page.goto(`${base}#prompt-templates`)
	await page.waitForSelector('.settings')
	assert.equal(await page.locator('.settings__nav-item--active').textContent(), 'Templates')
	assert.equal(await page.evaluate(() => location.hash), '#templates')

	// A hand-typed name is matched case-insensitively.
	await page.goto(`${base}#Templates`)
	await page.waitForSelector('.settings')
	assert.equal(await page.locator('.settings__nav-item--active').textContent(), 'Templates')

	// An unknown section falls back to General and is rewritten, so the URL is never a dead end.
	await page.goto(`${base}#nope`)
	await page.waitForFunction(() => location.hash === '')
	assert.equal(await page.locator('.settings__nav-item--active').textContent(), 'General')
}
