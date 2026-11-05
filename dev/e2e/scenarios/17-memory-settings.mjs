import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'

export const name = '17-memory-settings'

const exportedFile = {
	kind: 'local-browser-ai.memory',
	version: 1,
	exportedAt: 1,
	items: [
		{
			id: 'imported_1',
			title: 'Imported',
			text: 'Billing runs on the first Monday.',
			mode: 'auto',
			scope: 'global',
			createdAt: 1,
			updatedAt: 1,
		},
	],
}

export async function run(ctx) {
	await ctx.openSettings({ settings: localSettings('http://127.0.0.1:1/v1') })
	const { page } = ctx

	await page.locator('.settings__nav-item:has-text("Memory")').click()
	await page.waitForSelector('.memory-empty')
	assert.match(await page.locator('.memory-empty').textContent(), /Nothing saved yet/)

	// Add a memory through the editor.
	await page.locator('.section__action button:has-text("Add memory")').click()
	const editor = page.locator('section.group:has-text("New memory")')
	await editor.locator('input').first().fill('Formatting')
	await editor.locator('textarea').fill('Prefers tabs and no semicolons.')
	await editor.locator('select').selectOption('always')
	await editor.locator('button:has-text("Add memory")').click()

	await page.waitForFunction(() => window.__LB_AI_TEST__.currentMemory()?.items?.length === 1)
	let stored = await page.evaluate(() => window.__LB_AI_TEST__.readMemory())
	assert.equal(stored.items[0].title, 'Formatting')
	assert.equal(stored.items[0].mode, 'always')

	// Changing the mode from the row writes straight through.
	await page.locator('.memory-row__mode').selectOption('tool')
	await page.waitForFunction(() => window.__LB_AI_TEST__.currentMemory()?.items?.[0]?.mode === 'tool')

	// Editing the text keeps the id and bumps the timestamp.
	await page.locator('button[aria-label="Edit memory"]').click()
	const edit = page.locator('section.group:has-text("Edit memory")')
	await edit.locator('textarea').fill('Prefers tabs, no semicolons, single quotes.')
	await edit.locator('button:has-text("Save memory")').click()
	await page.waitForFunction(() => window.__LB_AI_TEST__.currentMemory()?.items?.[0]?.text?.includes('single quotes'))

	// Delete leaves a tombstone, and undo brings the memory back.
	await page.locator('button[aria-label="Delete memory"]').click()
	await page.waitForSelector('.notice--undo')
	await page.waitForFunction(() => Boolean(window.__LB_AI_TEST__.currentMemory()?.items?.[0]?.deletedAt))
	await page.locator('.notice--undo button:has-text("Undo")').click()
	await page.waitForFunction(() => !window.__LB_AI_TEST__.currentMemory()?.items?.[0]?.deletedAt)
	assert.equal(
		await page
			.locator('.row-item__title')
			.first()
			.textContent()
			.then((text) => text.includes('Formatting')),
		true,
	)

	// Export produces a file name without triggering a real download in the workspace.
	await page.evaluate(() => {
		HTMLAnchorElement.prototype.click = function () {
			window.__download = this.download
		}
	})
	await page.locator('button:has-text("Export memories")').click()
	const download = await page.evaluate(() => window.__download)
	assert.match(String(download), /^local-browser-ai-memory-\d{4}-\d{2}-\d{2}\.json$/)
	assert.match(await page.locator('.notice--good').textContent(), /Exported 1 memories/)

	// Import merges by id; the imported memory appears next to the existing one.
	await page.locator('input[type="file"]').setInputFiles({
		name: 'memory.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(exportedFile)),
	})
	await page.waitForFunction(() => window.__LB_AI_TEST__.currentMemory()?.items?.length === 2)
	assert.match(await page.locator('.notice--good').textContent(), /1 added, 0 updated, 0 skipped/)

	// Importing the same file again is a no-op rather than a duplicate.
	await page.locator('input[type="file"]').setInputFiles({
		name: 'memory.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(exportedFile)),
	})
	await page.waitForFunction(() => /0 added, 0 updated/.test(document.body.innerText))

	stored = await page.evaluate(() => window.__LB_AI_TEST__.readMemory())
	assert.equal(stored.items.length, 2)

	// A file that is not a memory export is rejected without touching storage.
	await page.locator('input[type="file"]').setInputFiles({
		name: 'other.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify({ hello: 'world' })),
	})
	await page.waitForSelector('.notice--bad')
	assert.match(await page.locator('.notice--bad').textContent(), /not a memory export/)
	assert.equal((await page.evaluate(() => window.__LB_AI_TEST__.readMemory())).items.length, 2)

	// Turning memory off is a setting, not a deletion.
	await page.locator('button[role="switch"][aria-label="Enable memory"]').click()
	await page.waitForFunction(() => window.__LB_AI_TEST__.currentSettings()?.memory?.enabled === false)
	assert.match(await page.locator('.section > .notice').first().textContent(), /Memory is off/)
	assert.equal((await page.evaluate(() => window.__LB_AI_TEST__.readMemory())).items.length, 2)
}
