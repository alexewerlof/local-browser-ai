import assert from 'node:assert/strict'
import { exampleTab, localSettings, waitForPageCount } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '30-page-versions'

/** The page as it reads after the user's next visit: one section more. */
const updatedExtraction = {
	url: exampleTab.url,
	baseUrl: exampleTab.url,
	canonicalUrl: exampleTab.url,
	title: 'Example Pricing',
	description: 'Revised prices',
	lang: 'en',
	faviconUrl: '',
	byline: '',
	publishedTime: '',
	selection: '',
	truncated: false,
	text: 'The Teams plan now costs 30 EUR per seat. Enterprise pricing is unchanged.',
	aria: '',
	controls: 0,
	html: [
		'<html><body><article>',
		'<h1>Example Pricing</h1>',
		'<p>Example makes collaboration software for small teams.</p>',
		'<h2>Teams</h2>',
		'<p>The Teams plan now costs 30 EUR per seat.</p>',
		'<h2>Enterprise</h2>',
		'<p>Enterprise pricing is unchanged.</p>',
		'<h2>Changelog</h2>',
		'<p>Prices went up in November.</p>',
		'</article></body></html>',
	].join(''),
}

/** Wait until the fake server has recorded `count` requests. */
async function waitForRequests(server, count) {
	while (server.requests.length < count) {
		await new Promise((done) => setTimeout(done, 25))
	}
	return server.requests[count - 1]
}

/**
 * Adding the same page twice keeps both captures. The second add becomes `p2` beside the
 * `p1` the chat already sent, so the model can compare the two versions and answer what
 * changed — and the earlier turn keeps the block it was sent with.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['Teams', ' is', ' 30 EUR.'] })
	try {
		// The first capture arrives from the context menu before the panel opened.
		await ctx.open({ settings: localSettings(server.endpoint), tab: exampleTab })
		const { page } = ctx
		await waitForPageCount(page, 1)

		await page.locator('.composer__input').fill('How much is the Teams plan?')
		await page.locator('[aria-label="Submit"]').click()
		const firstTurn = (await waitForRequests(server, 1)).messages.at(-1)
		assert.equal(firstTurn.role, 'user')
		assert.match(firstTurn.content, /## Page p1 — Example Pricing/)
		await page.waitForFunction(() => document.body.innerText.includes('Teams is 30 EUR.'))

		// The user reloads the page and adds it again from the context menu. Nothing about
		// the add says "replace": it is a second capture, and it gets the next handle.
		await page.evaluate((extraction) => window.__LB_AI_TEST__.addPage(undefined, extraction), updatedExtraction)
		await waitForPageCount(page, 2)
		// The capture has finished, so the count sits still even though p2 waits for a turn.
		assert.equal(await page.locator('.page-list__capturing').count(), 0)

		// The capture opened the list; both versions are in it, and only the new one waits.
		assert.equal(await page.locator('.page-list__item--pending').count(), 1)
		assert.equal(await page.locator('.page-list__item:not(.page-list__item--pending)').count(), 1)

		await page.locator('.composer__input').fill('What changed since my last visit?')
		await page.locator('[aria-label="Submit"]').click()
		const secondRequest = await waitForRequests(server, 2)

		const secondTurn = secondRequest.messages.at(-1)
		assert.match(secondTurn.content, /## Page p2 — Example Pricing/)
		// The page really was captured again, not replayed from the first snapshot.
		assert.match(secondTurn.content, /Changelog/)

		// Append-only: the turn that carried p1 still carries p1 and nothing else, so the
		// provider's cached prefix survives a re-add.
		const replayedFirst = secondRequest.messages.find((message) => message.content.includes('How much'))
		assert.match(replayedFirst.content, /## Page p1 — Example Pricing/)
		assert.doesNotMatch(replayedFirst.content, /## Page p2/)
	} finally {
		await server.close()
	}
}
