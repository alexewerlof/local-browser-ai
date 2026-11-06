import { Store } from '../core/store'
import { pageHandle } from '../core/context/page-block'
import type { PageSnapshot } from '../core/types'

/**
 * Pages of the conversation on screen, in the order they were added.
 *
 * They are kept apart from `Conversation` because a page carries its whole extracted
 * text: `runTurn` rewrites the conversation for every token, and the history drawer
 * reads every stored conversation at once. Neither should move megabytes of markdown.
 */
export const pagesStore = new Store<PageSnapshot[]>([])

/** Point the store at the pages of the conversation now on screen. */
export function bindPages(pages: PageSnapshot[]): void {
	pagesStore.set(pages)
}

/** Pages that have not reached a turn yet; their blocks are not in the prompt. */
export function pendingPages(pages: PageSnapshot[] = pagesStore.get()): PageSnapshot[] {
	return pages.filter((page) => !page.messageId)
}

/** Handle for a page that joins this conversation now. Handles are never reused. */
export function nextPageHandle(pages: PageSnapshot[] = pagesStore.get()): string {
	return pageHandle(pages.length)
}

/** Two spellings of the same document: the hash never reaches the server, and a
 * trailing slash is optional. */
function documentKey(url: string): string {
	try {
		const parsed = new URL(url)
		return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`
	} catch {
		return url
	}
}

/**
 * The page of this chat already showing `url`, if any.
 *
 * Only the selection path asks: a quote reuses the page it came from, so selecting five
 * passages on one page adds one page and five quotes. An explicit add ignores this and
 * captures again, which is how a chat ends up holding two versions of one page.
 */
export function findAttachedPage(url: string, pages: PageSnapshot[] = pagesStore.get()): PageSnapshot | undefined {
	const key = documentKey(url)
	return pages.find((page) => documentKey(page.url) === key)
}
