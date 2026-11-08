import assert from 'node:assert/strict'
import { exampleTab, localSettings, waitForPageCount } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '31-omnibox-prompt'

/**
 * A prompt accepted in the address bar is the one-gesture version of "open the panel,
 * add this page, type the prompt": a new chat, the page attached, and the prompt sent.
 *
 * The entry is seeded before the panel loads, because the omnibox is what opens it. Two
 * paths exist in the panel and both are covered here: this boot drain, and the nudge an
 * already-open panel gets further down.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['Ten', ' euros', ' a', ' month', '.'] })
	// The harness profile is reused between runs, so the chat needs a unique title.
	const prompt = `Omnibox ${Date.now()}`
	try {
		await ctx.open({
			settings: localSettings(server.endpoint),
			// No `tab` on purpose: that would queue a context-menu add as well, and the
			// point of this scenario is the prompt's own single page.
			storage: {
				'session:pendingOmniboxPrompt': { text: prompt, tabId: exampleTab.id, createdAt: Date.now() },
			},
		})
		const { page } = ctx

		await page.waitForFunction(() => document.body.innerText.includes('Ten euros a month.'))

		// A new chat, titled by the prompt, and nothing left in the composer.
		assert.equal(await page.locator('.header__title').textContent(), prompt)
		assert.equal(await page.locator('.composer__input').inputValue(), '', 'composer is empty')
		assert.equal(await page.locator('.message--user').count(), 1, 'one user turn')
		assert.equal(await page.locator('.message--assistant').count(), 1, 'one answer')

		// The page came along and reached the turn, so it is listed and no longer pending.
		await waitForPageCount(page, 1)
		assert.match(await page.locator('.page-chip__title').textContent(), /Example Pricing/)
		assert.equal(await page.locator('.page-list__item--pending').count(), 0)
		assert.equal(await page.locator('.message__pages .page-card').count(), 1, 'one card on the turn')

		// The block rides the first turn and the system prompt stays free of it, exactly as
		// if the page had been added from the context menu.
		const first = server.requests[0]
		const userTurn = first.messages.at(-1)
		assert.equal(userTurn.role, 'user')
		assert.match(userTurn.content, /## Page p1 — Example Pricing/)
		assert.ok(userTurn.content.includes(prompt))
		assert.doesNotMatch(first.messages[0].content, /## Page p1/)

		// The entry was taken once, so reopening the panel restores this chat instead of
		// running the same prompt again.
		await page.reload()
		await page.waitForSelector('.composer__input')
		assert.equal(await page.locator('.header__title').textContent(), prompt, 'restored title')
		assert.equal(await page.locator('.message--user').count(), 1, 'no replay of the prompt')
		assert.equal(await page.locator('.page-list__toggle').textContent(), '1', 'one restored page')
		assert.equal(server.requests.length, 1, 'no second request after reload')

		// A second prompt, this time while the panel is open: the nudge path.
		const second = 'And the Teams plan?'
		await page.evaluate((text) => window.__LB_AI_TEST__.omniboxPrompt(text), second)
		await page.waitForFunction((text) => document.querySelector('.header__title')?.textContent === text, second)

		// A new chat again, with its own single copy of the page.
		assert.equal(await page.locator('.message--user').count(), 1, 'fresh transcript')
		assert.equal(await page.locator('.page-list__toggle').textContent(), '1', 'one page in the new chat')
		assert.equal(await page.locator('.message__pages .page-card').count(), 1, 'one card in the new chat')
		assert.equal(server.requests.length, 2, 'second request')
		assert.match(server.requests[1].messages.at(-1).content, /## Page p1 — Example Pricing/)
		assert.ok(server.requests[1].messages.at(-1).content.includes(second))

		// The chat that was on screen is not lost: it is in Chats.
		await page.locator('[aria-label="Chat history"]').click()
		await page.waitForSelector('.history__title')
		assert.ok((await page.locator('.history__title').allTextContents()).includes(prompt))
	} finally {
		await server.close()
	}
}
