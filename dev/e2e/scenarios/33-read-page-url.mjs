import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '33-read-page-url'

/**
 * Reading a URL is one call with two decisions inside it.
 *
 * `read_page` with a `url` asks whether to open the link, then whether the extension may
 * read that site, and only then returns text. The call stays open across both, so the page
 * is in the chat by the time the model answers — and a denial is an answer, not a reason
 * to guess. A later `mode` call then reads the section it needs from the same page.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({
		chunks: ['The guide explains ', 'how to declare optional permissions.'],
		toolScript: (_body, index) => (index < 4 ? 'tool-call' : 'text'),
		toolCall: (_body, index) => {
			if (index === 0) {
				return { name: 'read_page', arguments: JSON.stringify({ url: 'https://docs.example.org/permissions' }) }
			}
			if (index === 1) {
				return {
					name: 'read_page',
					arguments: JSON.stringify({ mode: 'section', headings: ['Declaring optional permissions'] }),
				}
			}
			if (index === 2) {
				return { name: 'read_page', arguments: JSON.stringify({ mode: 'outline' }) }
			}
			// The same URL again: the chat already holds that document.
			return { name: 'read_page', arguments: JSON.stringify({ url: 'https://docs.example.org/permissions' }) }
		},
	})
	try {
		await ctx.open({
			settings: localSettings(server.endpoint, {
				model: 'llama-3.2-3b-instruct',
				context: {
					compactionThreshold: 0.75,
					keepRecentTurns: 4,
					outputReserveRatio: 0.2,
					// Four reads plus the answer: the fixture default of 4 would cap this run.
					maxToolSteps: 6,
				},
				tools: {
					enabled: ['read_page'],
					autoApprove: ['read_page'],
				},
			}),
			hostAccess: 'ask',
		})
		const { page } = ctx

		await page.locator('.composer__input').fill('Read the permissions guide and summarise it')
		await page.locator('button[aria-label="Submit"]').click()

		// First decision: allow the action. Nothing has opened yet.
		await page.waitForSelector('.tool__approval')
		assert.equal(await page.evaluate(() => window.__LB_AI_TEST__.opened.length), 0)
		await page.locator('.tool__approval button', { hasText: 'Allow' }).click()

		// The tab opens, and the second decision appears: may the extension read that site?
		await page.waitForSelector('.banner--warn')
		const openedUrls = await page.evaluate(() => window.__LB_AI_TEST__.opened)
		assert.deepEqual(openedUrls, ['https://docs.example.org/permissions'])

		// The model is not asked again while the user decides, and the card still offers
		// the manual path because the page is not in the chat yet.
		await page.waitForTimeout(400)
		assert.equal(server.requests.length, 1, 'the run must wait for the access decision')
		assert.equal(await page.locator('.tool__action').count(), 1)
		assert.equal(await page.locator('.tool__head .badge').textContent(), 'running')

		// The page the tool opened is what gets captured, with its own content.
		await page.evaluate(() =>
			window.__LB_AI_TEST__.setExtraction({
				url: 'https://docs.example.org/permissions',
				baseUrl: 'https://docs.example.org/',
				canonicalUrl: 'https://docs.example.org/permissions',
				title: 'Permissions - Docs',
				description: '',
				lang: 'en',
				faviconUrl: '',
				byline: '',
				publishedTime: '',
				selection: '',
				truncated: false,
				text: 'Declare optional host permissions to ask for access at runtime.',
				html: [
					'<html><head><title>Permissions - Docs</title></head><body><article>',
					'<h1>Permissions</h1>',
					'<h2>Declaring optional permissions</h2>',
					'<p>List the origins you may ask for in optional_host_permissions.</p>',
					'<h2>Asking at runtime</h2>',
					'<p>Call permissions.request from a click handler.</p>',
					'</article></body></html>',
				].join(''),
			}),
		)
		// Pressing the card's own button is the manual way through: it must finish the
		// request the tool is waiting on, not re-offer the chip and return. A dead button
		// here leaves the call waiting for the rest of the session.
		await page.locator('.tool__action button').click()

		await page.waitForFunction(() => document.body.innerText.includes('how to declare optional permissions.'))

		// The page joined the chat and the fallback button is gone.
		assert.match(await page.locator('.page-chip__title').textContent(), /Permissions - Docs/)
		assert.equal(await page.locator('.tool__action').count(), 0)

		// The result is content, not an echo of the URL that was passed in.
		const fetched = toolResult(server.requests[1], 'read_page')
		assert.equal(fetched.added, true, JSON.stringify(fetched))
		assert.equal(fetched.page, 'p1', JSON.stringify(fetched))
		assert.equal(fetched.mode, 'all', JSON.stringify(fetched))
		assert.match(fetched.text, /List the origins you may ask for/)
		assert.match(fetched.text, /Call permissions\.request/)
		assert.notEqual(fetched.text, 'https://docs.example.org/permissions')

		// A section read returns that section and nothing else.
		const section = toolResult(server.requests[2], 'read_page')
		assert.equal(section.mode, 'section', JSON.stringify(section))
		assert.deepEqual(
			section.sections.map((entry) => entry.heading),
			['Declaring optional permissions'],
		)
		assert.match(section.text, /List the origins/)
		assert.doesNotMatch(section.text, /Asking at runtime/)
		assert.doesNotMatch(section.text, /Call permissions\.request/)

		// And the outline is what tells the model those sections exist.
		const outline = toolResult(server.requests[3], 'read_page')
		assert.equal(outline.mode, 'outline')
		const headings = outline.pages[0].outline.map((entry) => entry.heading)
		assert.deepEqual(headings, ['Permissions', 'Declaring optional permissions', 'Asking at runtime'])

		// The same URL again is a cache hit: no second tab, no second capture, no claim
		// that a page was added when the chat already held it.
		const cached = toolResult(server.requests[4], 'read_page')
		assert.equal(cached.ok, true, JSON.stringify(cached))
		assert.equal(cached.added, undefined, 'the page was already in the chat')
		assert.match(cached.text, /List the origins you may ask for/)
		assert.deepEqual(
			await page.evaluate(() => window.__LB_AI_TEST__.opened),
			['https://docs.example.org/permissions'],
			'only the first read opened a tab',
		)
		assert.equal(await page.locator('.page-chip').count(), 1, 'one page, not a second copy')
	} finally {
		await server.close()
	}
}

/**
 * The tool message for a given tool name in a recorded request, parsed.
 *
 * Older requests in the same conversation still carry earlier results, so the call is
 * matched by name rather than taken from the end of the list.
 */
function toolResult(body, toolName) {
	const messages = body.messages.filter((entry) => entry.role === 'tool')
	assert.ok(messages.length > 0, 'the tool result should be sent back to the model')
	const match = messages.findLast((entry) => (entry.tool_call_id ?? '').length > 0 && entry.name === toolName)
	const message = match ?? messages[messages.length - 1]
	const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
	return JSON.parse(content)
}
