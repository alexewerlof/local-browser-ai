import { Store } from '../core/store'
import { pageHandle } from '../core/context/page-block'
import type { PageSnapshot } from '../core/types'
import { deletePages } from './database'

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

/**
 * The page that last joined the chat, as opposed to one a restore loaded.
 *
 * The composer opens the page list when this changes, so a page that just landed is on
 * screen (and one click from being removed) without the count being the only clue. A
 * restored chat appends nothing, which is why reopening the panel stays quiet.
 */
export const lastPageAddedStore = new Store<string | null>(null)

/** Pages that have not reached a turn yet; their blocks are not in the prompt. */
export function pendingPages(pages: PageSnapshot[] = pagesStore.get()): PageSnapshot[] {
	return pages.filter((page) => !page.messageId)
}

/**
 * A page the list and the transcript show. A search result page is captured so the model
 * can read it, but the search is the extension doing its job, so it is not a reference.
 */
export function isPageReference(page: PageSnapshot): boolean {
	return page.source !== 'search'
}

/**
 * Handle for a page that joins this conversation now. Handles are never reused, so this
 * counts up from the highest live one: removing a page leaves a gap rather than handing
 * an existing page's handle to the next capture.
 */
export function nextPageHandle(pages: PageSnapshot[] = pagesStore.get()): string {
	const highest = pages.reduce((max, page) => {
		const index = Number(page.handle.replace(/^p/, ''))
		return Number.isFinite(index) && index > max ? index : max
	}, 0)
	return pageHandle(highest)
}

/**
 * Take a page back out of the chat.
 *
 * Only a page that has not reached a turn yet can go: once a turn carries its block the
 * page is part of the transcript, and the request that carried it has already been sent.
 */
export async function removePage(page: PageSnapshot): Promise<boolean> {
	if (page.messageId) return false
	await deletePages([page.id])
	pagesStore.set(pagesStore.get().filter((entry) => entry.id !== page.id))
	return true
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
