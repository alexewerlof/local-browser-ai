import assert from 'node:assert/strict'
import { exampleTab, localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '09-page-index'

/** A page long enough that sending it whole would be wasteful. */
const LONG = Array.from(
	{ length: 40 },
	(_, index) =>
		`<p>Filler paragraph ${index} exists only to make this page long: it repeats the same unremarkable sentence about nothing in particular.</p>`,
).join('')

const extraction = {
	url: 'https://example.com/docs/guide',
	baseUrl: 'https://example.com/docs/guide',
	canonicalUrl: 'https://example.com/docs/guide',
	title: 'Transport guide',
	description: 'How the transport is configured',
	lang: 'en',
	faviconUrl: '',
	byline: '',
	publishedTime: '',
	selection: '',
	truncated: false,
	text: 'The transport identity is derived from the olshausen key.',
	aria: '',
	controls: 0,
	html: [
		'<html><body><article>',
		'<h1>Transport guide</h1>',
		LONG,
		'<h2>Authentication</h2>',
		'<p>Authentication derives the transport identity from the olshausen key you register.</p>',
		'<h2>Errors</h2>',
		'<p>Errors are reported as typed codes.</p>',
		'</article></body></html>',
	].join(''),
}

export async function run(ctx) {
	const server = await startFakeModelServer({
		chunks: ['The', ' key', ' is', ' olshausen', '.'],
		// First turn: the model reads a section. Second turn: it answers.
		toolScript: (_body, index) => (index === 0 ? 'tool-call' : 'text'),
		toolCall: { name: 'read_page_section', arguments: JSON.stringify({ heading: 'Authentication' }) },
	})

	try {
		const settings = localSettings(server.endpoint, { model: 'llama-3.2-3b-instruct' })
		settings.context = { ...settings.context, pageContext: 'auto', strategy: 'index', pageShare: 0.35 }

		await ctx.open({ settings, tab: exampleTab, extraction })
		const { page } = ctx

		await page.waitForSelector('.attachment')
		await page.locator('.composer__input').fill('Which key does authentication use?')
		await page.locator('button[aria-label="Send"]').click()
		await page.waitForFunction(() => document.body.innerText.includes('olshausen.'))

		// The prompt carried an index, not the page.
		const system = server.requests[0].messages[0].content
		assert.match(system, /At a glance/)
		assert.match(system, /Outline/)
		assert.match(system, /read_page_section/)
		assert.doesNotMatch(system, /Filler paragraph 30/)
		assert.ok(system.length < 4000, `system prompt should be small, was ${system.length} chars`)

		// The model could still reach the section it needed.
		const second = server.requests[1]
		const toolMessage = second.messages.find((message) => message.role === 'tool')
		assert.ok(toolMessage, 'the tool result should be sent back to the model')
		assert.match(String(toolMessage.content), /olshausen/)

		// The meter names the mode.
		await page.locator('.meter').click()
		assert.match(await page.locator('.popover').textContent(), /page index/)
	} finally {
		await server.close()
	}
}
