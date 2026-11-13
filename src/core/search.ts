import type { SearchDisposition } from '../browser/protocol'

/** The tab each chat last searched in, so its next search can reuse it. */
export const SEARCH_TABS_KEY = 'search-tabs.v1'

/** Chat id to tab id. Kept per chat: a search belongs to the conversation that asked. */
export type SearchTabs = Record<string, number>

function searchTabs(value: unknown): SearchTabs {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
	const map: SearchTabs = {}
	for (const [conversationId, tabId] of Object.entries(value as Record<string, unknown>)) {
		if (typeof tabId === 'number') map[conversationId] = tabId
	}
	return map
}

/** The tab this chat searched in last, if it still is a tab. */
export function readSearchTab(value: unknown, conversationId: string): number | undefined {
	return searchTabs(value)[conversationId]
}

export function withSearchTab(value: unknown, conversationId: string, tabId: number): SearchTabs {
	return { ...searchTabs(value), [conversationId]: tabId }
}

/**
 * What a search should do with tabs.
 *
 * `chrome.search.query` can only navigate: either the tab on screen (`CURRENT_TAB`) or a
 * new one. A conversation usually needs one results tab, so a `NEW_TAB` search that finds
 * a tab this extension searched in before reuses it — which means asking Chrome for
 * `CURRENT_TAB` after activating it.
 *
 * The lookup is per chat. One shared results tab would let a second chat navigate the tab
 * the first one is working from, and the tab group it sits in would then belong to a chat
 * that did not open it.
 *
 * Pure, because the choice is the interesting part and the worker is hard to test: the
 * tab ids and the `chrome.*` calls stay in `background.ts`.
 */
export interface SearchPlan {
	/** What to ask Chrome for. Differs from the request when an old tab is reused. */
	disposition: SearchDisposition
	/** The tab to activate first, when one is being reused. */
	tabId?: number
}

/**
 * `remembered` is a tab this extension searched in earlier and that still exists.
 *
 * A caller that asks for `CURRENT_TAB` or `NEW_WINDOW` gets exactly what it asked for:
 * those are deliberate choices about the user's window, not a request for "a" tab.
 */
export function planSearch(requested: SearchDisposition, remembered?: number): SearchPlan {
	if (requested !== 'NEW_TAB') return { disposition: requested }
	if (remembered === undefined) return { disposition: 'NEW_TAB' }
	return { disposition: 'CURRENT_TAB', tabId: remembered }
}
