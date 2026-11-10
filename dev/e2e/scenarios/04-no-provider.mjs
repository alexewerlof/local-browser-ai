import assert from 'node:assert/strict'

export const name = '04-no-provider'

/**
 * A fresh install ships with no provider. The panel says so once and points at Settings,
 * and Providers offers exactly one thing to do: add a local server.
 */
export async function run(ctx) {
	await ctx.open({})
	const { page } = ctx

	await page.waitForSelector('.app')
	const banner = await page.locator('.banner').first().textContent()
	assert.match(banner, /No model is configured yet/i)

	// The setup button opens Settings at Providers, where a server and its models are added.
	const before = await page.evaluate(() => window.__LB_AI_TEST__.opened.length)
	await page.locator('.banner button:has-text("Set up a model")').click()
	await page.waitForFunction((previous) => window.__LB_AI_TEST__.opened.length > previous, before)
	const opened = await page.evaluate(() => window.__LB_AI_TEST__.opened.at(-1))
	assert.equal(new URL(opened).hash, '#providers')

	// Providers is empty, and there is no built-in model to fall back on.
	await ctx.openSettings({}, '#providers')
	const settingsPage = ctx.page
	await settingsPage.waitForSelector('.settings')
	assert.equal(await settingsPage.locator('.provider').count(), 0)
	assert.equal(await settingsPage.locator('.section__action button:has-text("Add provider")').count(), 1)
	assert.doesNotMatch(await settingsPage.locator('.section').first().textContent(), /built-in/i)

	// The one preset-less editor opens straight into the server form.
	await settingsPage.locator('.section__action button:has-text("Add provider")').click()
	await settingsPage.waitForSelector('.group__title:has-text("New provider")')
	assert.equal(await settingsPage.locator('input[aria-label="Base URL"]').inputValue(), 'http://localhost:9931/v1')
}
