import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '41-default-model'

/** Two models on one server, so a default can be moved from one to the other. */
const providers = [
	{
		id: 'local',
		label: 'Fake local server',
		baseURL: 'http://127.0.0.1:1/v1',
		apiKey: '',
		models: ['alpha-model', 'beta-model'],
		contextWindowOverride: 32_000,
	},
]

/**
 * The default model is set by the star in the provider table, not by the composer picker.
 * There is no Models section: this scenario is also what keeps the two surfaces apart.
 */
export async function run(ctx) {
	const settings = localSettings('http://127.0.0.1:1/v1', {
		providers,
		defaultModel: { providerId: 'local', modelId: 'alpha-model' },
	})
	await ctx.open({ settings })
	const { page } = ctx

	/** The default currently in storage, as the shim sees it. */
	const defaultInStorage = () => page.evaluate(() => window.__LB_AI_TEST__.currentSettings()?.defaultModel?.modelId)

	// Switching model in the panel is about this chat, so the default must not move.
	await page.locator('.chip--model').click()
	await page.waitForSelector('.popover--fill')
	await page.locator('.popover__item--model', { hasText: 'beta-model' }).click()
	await page.waitForFunction(() => document.querySelector('.chip--model')?.textContent?.includes('beta-model'))
	assert.equal(await defaultInStorage(), 'alpha-model')

	// The star is the default control, and it sits in the table next to the model.
	await ctx.openSettings(settings, '#providers')
	const settingsPage = ctx.page
	await settingsPage.waitForSelector('.settings')

	const openEditor = async () => {
		await settingsPage.locator('.provider button:has-text("Edit")').click()
		const editor = settingsPage.locator('section.group:has-text("Edit Fake local server")')
		await editor.waitFor()
		return editor
	}

	let editor = await openEditor()
	// The saved default is already starred; every other row offers to become it.
	assert.equal(await editor.locator('.models-table__default--on').count(), 1)
	assert.equal(await editor.locator('button[aria-label="Make beta-model the default model"]').count(), 1)
	assert.equal(await editor.locator('button[aria-label="Make alpha-model the default model"]').count(), 0)
	await editor.locator('button[aria-label="Make beta-model the default model"]').click()
	await editor.locator('button:has-text("Save provider")').click()
	await settingsPage.waitForFunction(
		() => window.__LB_AI_TEST__.currentSettings()?.defaultModel?.modelId === 'beta-model',
	)

	// Cancel throws the draft away: starring a model and backing out changes nothing.
	editor = await openEditor()
	await editor.locator('button[aria-label="Make alpha-model the default model"]').click()
	await editor.locator('button:has-text("Cancel")').click()
	assert.equal(
		await settingsPage.evaluate(() => window.__LB_AI_TEST__.currentSettings()?.defaultModel?.modelId),
		'beta-model',
	)

	// Switching the default off and saving re-defaults, instead of leaving a reference no picker offers.
	editor = await openEditor()
	await editor.locator('button[aria-label="Use beta-model"]').click()
	await editor.locator('button:has-text("Save provider")').click()
	await settingsPage.waitForFunction(
		() => window.__LB_AI_TEST__.currentSettings()?.defaultModel?.modelId === 'alpha-model',
	)
	const stored = await settingsPage.evaluate(() => window.__LB_AI_TEST__.readSettings())
	assert.deepEqual(stored.providers[0].models, ['alpha-model'])
}
