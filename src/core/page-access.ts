import type { PageSource } from './types'

/**
 * What the box above the composer is asking about.
 *
 * `confirm` is the composer's add button: nothing has been asked of Chrome yet. The box
 * exists so the choice between a permanent grant and reading just this page is made by
 * the user, rather than by a modal that appears before they know what it is for.
 *
 * `waiting` is a capture parked until its site is granted — a tab a tool opened, or the
 * tool card's own button after that click's gesture was spent. A tool call stays open
 * until this is answered, so the wording has to say how to answer it from the browser's
 * own UI as well.
 */
export type PageAccessRequest =
	| { kind: 'confirm'; tabId: number; url: string }
	| { kind: 'waiting'; tabId: number; url: string; chip: boolean; source?: PageSource }

export interface PageAccessCopy {
	/** The sentence the box shows. */
	message: string
	/**
	 * Whether the permanent grant is the route to recommend here.
	 *
	 * It is for a search: a model that cannot read its own search results is not much of
	 * an agent, and the same engine is used again on the next question. Every other page
	 * is one the user happened to be on, so the temporary read is the default.
	 */
	recommendPermanent: boolean
}

/** The box's two buttons, shared so a scenario and the panel cannot drift apart. */
export const PAGE_ACCESS_LABELS = { continue: 'Continue', cancel: 'Cancel' } as const

/**
 * Word the box for one request.
 *
 * `host` is passed in because this layer knows nothing about URLs' shape as browsers use
 * them: the caller already has `hostOf`. Every kind names the site, because the permanent
 * grant is per origin — allowing one page on `kaddio.com/c/test` allows the whole of
 * `kaddio.com` — and a sentence that only said "this page" would understate it.
 */
export function describePageAccess(request: PageAccessRequest, host: string): PageAccessCopy {
	if (request.kind === 'confirm') {
		return {
			message:
				`Adding the page this way gives permanent permission to read and change your data on ${host}. ` +
				'For a one-off temporary permission, right-click on the page and choose “Add to chat”, or press the ' +
				'extension icon in the Chrome toolbar instead.',
			recommendPermanent: false,
		}
	}

	if (request.source === 'search') {
		return {
			message: request.chip
				? `The search results are on ${host}. Continue makes it readable permanently, so later searches need no prompt; or allow it in the address bar.`
				: `The search results are on ${host}. Continue makes it readable permanently, so later searches need no prompt.`,
			recommendPermanent: true,
		}
	}

	return {
		message: request.chip
			? `To read ${host} once, choose “Add to chat” from the right-click menu or the toolbar button. The address-bar prompt makes it permanent instead.`
			: `To read ${host} once, right-click the page and choose “Add to chat”, or use the toolbar button. Continue makes it permanent instead.`,
		recommendPermanent: false,
	}
}
