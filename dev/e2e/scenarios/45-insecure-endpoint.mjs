import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '45-insecure-endpoint'

/**
 * Two servers reached over plain HTTP: one on the network, one on loopback. Only the first
 * is a privacy risk, because the second never crosses a network — so the warning must be a
 * mark on that server and not a badge on the ordinary local setup.
 */
const providers = [
	{
		id: 'lan',
		label: 'Mac mini server',
		baseURL: 'http://mac-mini.localdomain:8080/v1',
		apiKey: '',
		models: ['gemma-4-12B-it'],
		contextWindowOverride: 32_000,
	},
	{
		id: 'local',
		label: 'This machine',
		baseURL: 'http://127.0.0.1:9931/v1',
		apiKey: '',
		models: ['gemma-4-E4B-it'],
		contextWindowOverride: 32_000,
	},
]

export async function run(ctx) {
	const settings = localSettings('http://127.0.0.1:9931/v1', {
		providers,
		defaultModel: { providerId: 'local', modelId: 'gemma-4-E4B-it' },
	})
	await ctx.open({ settings })
	const panel = ctx.page

	// The model picker: one glyph on the network server's heading, before its name, and
	// nothing on the loopback one.
	await panel.locator('.model-menu__trigger').click()
	await panel.waitForSelector('.popover')

	const groups = panel.locator('.popover__group')
	assert.equal(await groups.count(), 2)

	const network = groups.filter({ hasText: 'Mac mini server' })
	const loopback = groups.filter({ hasText: 'This machine' })
	assert.equal(await network.locator('.popover__group-warning').count(), 1)
	assert.equal(await loopback.locator('.popover__group-warning').count(), 0)

	const summary = 'Unencrypted traffic exposes your prompt and attached pages. Only use over VPN or trusted networks.'
	assert.equal(await network.locator('.popover__group-warning').getAttribute('aria-label'), summary)
	assert.equal(
		await network.locator('.popover__group-warning').getAttribute('title'),
		summary,
		'the tooltip is the same sentence the screen reader gets',
	)

	// Said once for the whole group: the models are reached the same way, so a mark on every
	// row would only repeat the heading all the way down the list.
	assert.equal(await network.locator('.popover__item-warning').count(), 0)

	// The name is still the heading's text, so the mark costs the label nothing.
	assert.equal(await network.locator('.popover__group-label').textContent(), 'Mac mini server')

	// The mark leads the name, on the same line.
	const mark = await network.locator('.popover__group-warning').boundingBox()
	const label = await network.locator('.popover__group-name').boundingBox()
	assert.ok(mark && label)
	assert.ok(mark.x + mark.width <= label.x, 'the mark sits before the name')
	assert.ok(mark.y < label.y + label.height && mark.y + mark.height > label.y, 'the mark shares the name line')

	// A row's own line is unchanged by the heading's mark: name on top, facts under it.
	const facts = await network.locator('.popover__item-facts').boundingBox()
	const nameLine = await network.locator('.popover__item-main').boundingBox()
	assert.ok(facts && nameLine)
	assert.ok(Math.abs(facts.x - nameLine.x) <= 1, 'the facts line stays aligned with the name')

	// Settings → Model Providers: the same warning under the address it is about, worded
	// with what is at stake rather than only with what the protocol is — and without the
	// address itself, which the field right above it already shows.
	await ctx.openSettings({ settings }, '#providers')
	const page = ctx.page
	await page.locator('.provider:has-text("Mac mini server") button:has-text("Edit")').click()
	const editor = page.locator('section.group:has-text("Edit Mac mini server")')
	await editor.waitFor()

	const warning = editor.locator('.url-warning')
	await warning.waitFor()
	assert.match(await warning.textContent(), /Unencrypted connection/)
	assert.match(await warning.textContent(), /Requests travel over plain HTTP/)
	assert.match(await warning.textContent(), /VPN or a network you trust/)
	assert.ok(!(await warning.textContent()).includes('mac-mini'), 'the warning does not repeat the host')

	// It follows what is typed, so correcting the address is what removes it.
	const url = editor.locator('input[aria-label="Base URL"]')
	const warns = () => page.waitForFunction(() => document.querySelector('.url-warning') !== null)
	const quiet = () => page.waitForFunction(() => document.querySelector('.url-warning') === null)

	await url.fill('https://mac-mini.localdomain:8443/v1')
	await quiet()

	await url.fill('http://localhost:8080/v1')
	await quiet()

	await url.fill('http://192.168.1.20:8080/v1')
	await warns()
	// A different host, the same sentence: the copy describes the transport, not the address.
	assert.match(await editor.locator('.url-warning').textContent(), /Requests travel over plain HTTP/)

	// Cancel leaves the stored provider untouched, so the panel keeps its own answer.
	await editor.locator('button:has-text("Cancel")').click()
	await page.waitForFunction(
		() =>
			window.__LB_AI_TEST__.currentSettings()?.providers?.[0]?.baseURL === 'http://mac-mini.localdomain:8080/v1',
	)
}
