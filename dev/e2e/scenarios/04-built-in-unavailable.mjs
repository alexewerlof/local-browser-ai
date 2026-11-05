import assert from 'node:assert/strict'
import { promptApiOnlySettings } from '../fixtures.mjs'

export const name = '04-built-in-unavailable'

export async function run(ctx) {
	// The harness browser has no Prompt API, so the built-in provider must degrade
	// into a clear setup banner instead of a dead end.
	await ctx.open({ settings: promptApiOnlySettings() })
	const { page } = ctx

	await page.waitForSelector('.banner')
	const banner = await page.locator('.banner').first().textContent()
	assert.match(banner, /built-in model is (not available|unavailable)/i)
	assert.equal(await page.locator('button:has-text("Set up a model")').isVisible(), true)

	// Chat is still usable to compose; the submit button stays available once there is text.
	await page.locator('.composer__input').fill('Hello')
	assert.equal(await page.locator('button[aria-label="Submit"]').isEnabled(), true)

	// Setup opens Settings at Models, not at the landing section.
	await page.locator('button:has-text("Set up a model")').click()
	await page.waitForFunction(() => window.__LB_AI_TEST__.opened.length === 1)
	const opened = await page.evaluate(() => window.__LB_AI_TEST__.opened[0])
	assert.equal(new URL(opened).hash, '#/models')
}
