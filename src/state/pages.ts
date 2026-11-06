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
