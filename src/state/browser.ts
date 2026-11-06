import type { CapturedPage } from '../core/types'
import { Store } from '../core/store'
import {
	extractTab,
	focusPage as focusPageInBrowser,
	getTabInfo,
	onBackgroundEvent,
	takePendingPages,
} from '../browser/client'
import { processExtraction } from '../browser/extract/pipeline'
import type { TabInfo } from '../browser/protocol'

export const tabInfoStore = new Store<TabInfo | null>(null)

export interface PendingApproval {
	id: string
	toolName: string
	input: unknown
	resolve: (approved: boolean) => void
}

export const approvalsStore = new Store<PendingApproval[]>([])

export function requestApproval(
	toolCallId: string,
	toolName: string,
	input: unknown,
	signal?: AbortSignal,
): Promise<boolean> {
	if (signal?.aborted) return Promise.resolve(false)
	return new Promise<boolean>((resolve) => {
		const settle = (approved: boolean) => {
			approvalsStore.set((current) => current.filter((entry) => entry.id !== toolCallId))
			resolve(approved)
		}
		approvalsStore.set((current) => [
			...current.filter((entry) => entry.id !== toolCallId),
			{ id: toolCallId, toolName, input, resolve: settle },
		])
		signal?.addEventListener('abort', () => settle(false), { once: true })
	})
}

export function resolveApproval(toolCallId: string, approved: boolean): void {
	const entry = approvalsStore.get().find((candidate) => candidate.id === toolCallId)
	entry?.resolve(approved)
}

/** Extract a tab into a page, throwing a typed error on failure. */
export async function extractPage(tabId?: number): Promise<{ page: CapturedPage; info: TabInfo }> {
	const info = await getTabInfo(tabId)
	const result = await extractTab(info.id)
	const page = processExtraction(result)
	// The worker's tab metadata is fresher than the page's own: a page may carry no
	// favicon link, and a title-less tab still has one.
	if (!page.faviconUrl) page.faviconUrl = info.faviconUrl
	if (!page.title) page.title = info.title
	tabInfoStore.set(info)
	return { page, info }
}

/** Tabs the user added from the context menu while the panel was not listening. */
export function takePendingPageTabs(): Promise<number[]> {
	return takePendingPages()
}

/** Bring the page behind a card back on screen, reopening it when its tab is gone. */
export function focusPage(tabId: number | undefined, url: string): Promise<void> {
	return focusPageInBrowser(tabId, url)
}

export interface BrowserEventHandlers {
	onPageAdd: (tabId: number) => void
	onSelection: (text: string) => void
}

/** Wire background events into the app. Returns an unsubscribe function. */
export function initBrowserEvents(handlers: BrowserEventHandlers): () => void {
	return onBackgroundEvent((event) => {
		switch (event.type) {
			case 'page.add':
				handlers.onPageAdd(event.tabId)
				break
			case 'selection.add':
				handlers.onSelection(event.text)
				break
		}
	})
}
