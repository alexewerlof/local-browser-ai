import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '24-settings-routes'

/**
 * The rail section lives in the fragment, so a refresh or a link keeps the section the user
 * was reading instead of dropping back to General.
 */
export async function run(ctx) {
	await ctx.openOptions({ settings: localSettings('http://127.0.0.1:1/v1') })
	const { page } = ctx

	// The bare URL is canonicalised to the landing route.
	assert.equal(await page.evaluate(() => location.hash), '#/')
	assert.equal(await page.locator('.options__nav-item--active').textContent(), 'General')

	// Choosing a section writes it to the fragment.
	await page.locator('.options__nav-item:has-text("Skills")').click()
	await page.waitForSelector('.options__content >> text=Skills are prompt templates')
	assert.equal(await page.evaluate(() => location.hash), '#/skills')

	// A refresh keeps the section.
	await page.reload()
	await page.waitForSelector('.options')
	assert.equal(await page.evaluate(() => location.hash), '#/skills')
	assert.equal(await page.locator('.options__nav-item--active').textContent(), 'Skills')
	assert.equal(await page.locator('.options__content >> text=Skills are prompt templates').count(), 1)

	// A second section is a history entry, so Back returns to the previous one.
	await page.locator('.options__nav-item:has-text("Memory")').click()
	await page.waitForSelector('.memory-empty')
	assert.equal(await page.evaluate(() => location.hash), '#/memory')
	await page.goBack()
	await page.waitForSelector('.options__content >> text=Skills are prompt templates')
	assert.equal(await page.evaluate(() => location.hash), '#/skills')
	assert.equal(await page.locator('.options__nav-item--active').textContent(), 'Skills')

	// A deep link opens its section directly, which is what the panel's gears use.
	const base = page.url().split('#')[0]
	await page.goto(`${base}#/mcp`)
	await page.waitForSelector('.options')
	assert.equal(await page.locator('.options__nav-item--active').textContent(), 'MCP')

	// Hand-typed variants resolve to the same section.
	await page.goto(`${base}#skills`)
	await page.waitForSelector('.options')
	assert.equal(await page.locator('.options__nav-item--active').textContent(), 'Skills')

	// An unknown section falls back to General and is rewritten, so the URL is never a dead end.
	await page.goto(`${base}#/nope`)
	await page.waitForFunction(() => location.hash === '#/')
	assert.equal(await page.locator('.options__nav-item--active').textContent(), 'General')
}
