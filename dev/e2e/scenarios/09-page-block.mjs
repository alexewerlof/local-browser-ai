import assert from 'node:assert/strict'
import { exampleTab, localSettings, waitForPageCount } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '09-page-block'

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

/**
 * A long page costs only its outline in the conversation, and the model reads the
 * section it needs through the page tools.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({
		chunks: ['The', ' key', ' is', ' olshausen', '.'],
		// First turn: the model reads a section. Second turn: it answers.
		toolScript: (_body, index) => (index === 0 ? 'tool-call' : 'text'),
		toolCall: {
			name: 'read_page',
			arguments: JSON.stringify({ mode: 'section', headings: ['Authentication'] }),
		},
	})

	try {
		await ctx.open({
			settings: localSettings(server.endpoint, { model: 'llama-3.2-3b-instruct' }),
			tab: exampleTab,
			extraction,
		})
		const { page } = ctx

		await waitForPageCount(page, 1)
		await page.locator('.composer__input').fill('Which key does authentication use?')
		await page.locator('[aria-label="Submit"]').click()
		await page.waitForFunction(() => document.body.innerText.includes('olshausen.'))

		// The prompt carried an outline, not the page.
		const body = server.requests[0]
		const userTurn = body.messages.at(-1)
		assert.match(userTurn.content, /## Page p1 — Transport guide/)
		assert.match(userTurn.content, /Outline \(id, heading, reading size\)/)
		assert.match(userTurn.content, /read_page/)
		assert.doesNotMatch(userTurn.content, /Filler paragraph 30/)
		assert.ok(userTurn.content.length < 2500, `page block should be small, was ${userTurn.content.length} chars`)

		// The model could still reach the section it needed.
		const second = server.requests[1]
		const toolMessage = second.messages.find((message) => message.role === 'tool')
		assert.ok(toolMessage, 'the tool result should be sent back to the model')
		assert.match(String(toolMessage.content), /olshausen/)
	} finally {
		await server.close()
	}
}
