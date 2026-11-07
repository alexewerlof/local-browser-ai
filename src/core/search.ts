import type { SearchDisposition } from '../browser/protocol'

/**
 * What a search should do with tabs.
 *
 * `chrome.search.query` can only navigate: either the tab on screen (`CURRENT_TAB`) or a
 * new one. A conversation usually needs one results tab, so a `NEW_TAB` search that finds
 * a tab this extension searched in before reuses it — which means asking Chrome for
 * `CURRENT_TAB` after activating it.
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
