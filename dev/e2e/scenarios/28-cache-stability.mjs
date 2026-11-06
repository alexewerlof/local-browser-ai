import assert from 'node:assert/strict'
import { exampleTab, localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '28-cache-stability'

const desk = {
	id: 43,
	windowId: 1,
	url: 'https://garden.example/desk',
	title: 'Standing desk — Garden',
	favIconUrl: '',
}

const deskExtraction = {
	url: desk.url,
	baseUrl: desk.url,
	canonicalUrl: desk.url,
	title: desk.title,
	description: 'A desk',
	lang: 'en',
	faviconUrl: '',
	byline: '',
	publishedTime: '',
	selection: '',
	truncated: false,
	text: 'The desk costs 1299 EUR.',
	aria: '',
	controls: 0,
	html: [
		'<html><body><article>',
		'<h1>Standing desk</h1>',
		'<p>The desk costs 1299 EUR.</p>',
		'</article></body></html>',
	].join(''),
}

/**
 * The promise of the append-only design: adding a page or asking again never rewrites
 * what was already sent, so a local model can reuse its cached prefix.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['Noted', '.'] })
	try {
		await ctx.open({ settings: localSettings(server.endpoint), tab: exampleTab })
		const { page } = ctx

		await page.waitForSelector('.page-chip')
		await page.locator('.composer__input').fill('What does the first page cost?')
		await page.locator('[aria-label="Submit"]').click()
		await page.waitForFunction(() => document.querySelectorAll('.message--assistant').length === 1)

		// Second turn, with a second page added in between.
		await page.evaluate(
			([nextTab, nextExtraction]) => window.__LB_AI_TEST__.addPage(nextTab, nextExtraction),
			[desk, deskExtraction],
		)
		await page.waitForFunction(() => document.querySelectorAll('.page-chip').length === 2)
		await page.locator('.composer__input').fill('And the second one?')
		await page.locator('[aria-label="Submit"]').click()
		await page.waitForFunction(() => document.querySelectorAll('.message--assistant').length === 2)

		assert.equal(server.requests.length, 2)
		const [first, second] = server.requests

		// Everything the first request sent is still byte-identical in the second one.
		assert.deepEqual(second.messages.slice(0, first.messages.length), first.messages)
		assert.deepEqual(second.system ?? second.messages[0]?.content, first.system ?? first.messages[0]?.content)

		// The new page only shows up in the newest turn.
		const last = second.messages.at(-1)
		assert.match(last.content, /## Page p2/)
		assert.doesNotMatch(JSON.stringify(first.messages), /## Page p2/)
	} finally {
		await server.close()
	}
}
