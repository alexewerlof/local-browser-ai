import assert from 'node:assert/strict'
import { deskExtraction, deskTab, exampleTab, localSettings, waitForPageCount, waitForRequests } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '46-tab-groups'

/**
 * The tabs a tool opens belong to the chat that asked for them.
 *
 * A search and a `read_page` of a URL both leave a tab behind, and those tabs are the
 * extension's doing rather than the user's. Chrome cannot name a group when it creates a
 * tab, so the panel groups them afterwards, remembering one group per chat — which is what
 * keeps one chat's results apart from another's, and from the tab the user was reading.
 *
 * A group the user closes is *gone*, and the next tab has to start a new one rather than
 * failing on an id Chrome no longer knows.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({
		chunks: ['Here is what I found.'],
		// Requests 0–2 are the first chat's three tool calls and 3 its answer; 4, 6 are the
		// second chat's two searches and 5, 7 their answers.
		toolScript: (_body, index) => ([3, 5, 7].includes(index) ? 'text' : 'tool-call'),
		toolCall: (_body, index) => {
			if (index === 2) {
				// The one read that opens a tab, which is the other way a chat gets one.
				return { name: 'read_page', arguments: JSON.stringify({ url: 'https://docs.example.org/permissions' }) }
			}
			const query = { 0: 'alpha', 1: 'beta', 6: 'delta' }[index] ?? 'gamma'
			return { name: 'search_web', arguments: JSON.stringify({ query }) }
		},
	})
	try {
		await ctx.open({
			settings: localSettings(server.endpoint, {
				model: 'llama-3.2-3b-instruct',
				tools: { enabled: ['search_web', 'read_page'], autoApprove: ['search_web'] },
			}),
			tab: exampleTab,
		})
		const { page } = ctx
		await waitForPageCount(page, 1)
		// A page the user added has a card, which is the one control that reopens a closed tab.
		await page.evaluate(
			([nextTab, nextExtraction]) => window.__LB_AI_TEST__.addPage(nextTab, nextExtraction),
			[deskTab, deskExtraction],
		)
		await waitForPageCount(page, 2)

		/** The strip as the shim holds it: one group per chat, with the tabs it caught. */
		const tabGroups = () => page.evaluate(() => window.__LB_AI_TEST__.tabGroups)
		/** Grouping lands a moment after the tool call returns, so wait for the count. */
		const waitForGroupedTabs = (count) =>
			page.waitForFunction(
				(expected) =>
					window.__LB_AI_TEST__.tabGroups.reduce((sum, group) => sum + group.tabs.length, 0) === expected,
				count,
			)
		const waitForIdle = () =>
			page.waitForFunction(() => document.querySelector('[aria-label="Stop generating"]') === null)

		await page.locator('.composer__input').fill('Compare alpha and beta, then read the permissions docs')
		await page.locator('button[aria-label="Submit"]').click()

		// Reading a URL always asks, because opening a tab is an action.
		await page.locator('.tool__approval button', { hasText: 'Allow' }).click()
		await waitForRequests(server, 4)
		await waitForIdle()

		// Two searches and one URL read: one group, because it is one chat. The two pages the
		// user added are untouched: they were already open, so nothing had to be grouped.
		await waitForGroupedTabs(3)
		const first = await tabGroups()
		assert.equal(first.length, 1, JSON.stringify(first))
		assert.equal(first[0].tabs.length, 3, JSON.stringify(first))
		assert.equal(
			[42, deskTab.id].some((tabId) => first[0].tabs.includes(tabId)),
			false,
			JSON.stringify(first),
		)
		const firstChatGroup = first[0].id

		// A card whose tab was closed reopens it, and that tab is the extension's too, so it
		// joins the chat's group instead of starting a second one.
		await page.evaluate((tabId) => window.__LB_AI_TEST__.closeTab(tabId), deskTab.id)
		await page.locator('.message__pages .page-card__link').nth(1).click()
		await waitForGroupedTabs(4)
		const reopened = await tabGroups()
		assert.equal(reopened.length, 1, JSON.stringify(reopened))
		assert.equal(reopened[0].id, firstChatGroup, 'a reopened tab must not start a second group')
		assert.equal(reopened[0].tabs.includes(deskTab.id), false, JSON.stringify(reopened))

		// A second chat gets a second group, holding only its own tabs.
		await page.locator('button[aria-label="New chat"]').click()
		await page.locator('.composer__input').fill('Look up gamma')
		await page.locator('button[aria-label="Submit"]').click()
		await waitForRequests(server, 6)
		await waitForIdle()
		await waitForGroupedTabs(5)

		const second = await tabGroups()
		assert.equal(second.length, 2, JSON.stringify(second))
		const secondChatGroup = second.find((group) => group.id !== firstChatGroup)
		assert.ok(secondChatGroup, JSON.stringify(second))
		assert.equal(secondChatGroup.tabs.length, 1, JSON.stringify(second))
		assert.equal(
			secondChatGroup.tabs.some((tabId) => reopened[0].tabs.includes(tabId)),
			false,
			'the two chats must not share a tab',
		)

		// The chat id travels with the search, so a reused results tab can never be another
		// chat's. One chat's searches agree; the two chats disagree.
		const searches = await page.evaluate(() => window.__LB_AI_TEST__.searches)
		assert.equal(searches.length, 3, JSON.stringify(searches))
		assert.ok(searches[0].conversationId)
		assert.equal(searches[0].conversationId, searches[1].conversationId)
		assert.notEqual(searches[1].conversationId, searches[2].conversationId)

		// Closing the group — the user's X on it — takes the tabs with it, so the next tab
		// of that chat has to start a fresh group instead of joining the dead id.
		await page.evaluate((id) => window.__LB_AI_TEST__.closeGroup(id), secondChatGroup.id)
		await page.locator('.composer__input').fill('Look up delta')
		await page.locator('button[aria-label="Submit"]').click()
		await waitForRequests(server, 8)
		await waitForIdle()
		await waitForGroupedTabs(5)

		const third = await tabGroups()
		const kept = third.find((group) => group.id === firstChatGroup)
		assert.ok(kept, 'the other chat keeps the group it opened')
		assert.equal(kept.tabs.length, 4, JSON.stringify(kept))
		const replaced = third.find((group) => group.id !== firstChatGroup)
		assert.ok(replaced, JSON.stringify(third))
		assert.notEqual(replaced.id, secondChatGroup.id, 'a group that is gone cannot be reused')
		assert.equal(replaced.tabs.length, 1, JSON.stringify(replaced))

		// The second chat's own searches name the same chat, so its new group is its own.
		const afterClose = await page.evaluate(() => window.__LB_AI_TEST__.searches)
		assert.equal(afterClose.length, 4, JSON.stringify(afterClose))
		assert.equal(afterClose[2].conversationId, afterClose[3].conversationId)
	} finally {
		await server.close()
	}
}
