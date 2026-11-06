import type { CapturedPage } from '../core/types'
import type { OmniboxPrompt } from '../core/omnibox'
import { Store } from '../core/store'
import {
	extractTab,
	focusPage as focusPageInBrowser,
	getTabInfo,
	onBackgroundEvent,
	takePendingOmniboxPrompt,
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
export async function extractPage(
	tabId?: number,
	/** Metadata already fetched by the caller, to save a second `tab.info` round trip. */
	known?: TabInfo,
): Promise<{ page: CapturedPage; info: TabInfo }> {
	const info = known ?? (await getTabInfo(tabId))
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

/** The prompt accepted in the address bar, if the worker still holds one. */
export function takeOmniboxPrompt(attempts?: number): Promise<OmniboxPrompt | null> {
	return takePendingOmniboxPrompt(attempts)
}

/** Tab metadata (title, URL, favicon) without extracting the page. */
export function readTabInfo(tabId?: number): Promise<TabInfo> {
	return getTabInfo(tabId)
}

/** Bring the page behind a card back on screen, reopening it when its tab is gone. */
export function focusPage(tabId: number | undefined, url: string): Promise<void> {
	return focusPageInBrowser(tabId, url)
}

export interface BrowserEventHandlers {
	/**
	 * A nudge, not the page itself: the worker queues the tab *and* broadcasts it, so the
	 * queue is the single source of truth. Adding from the event as well would add the
	 * same page twice when both paths land.
	 */
	onPageAdd: () => void
	/** Selected text, and the tab it came from, because the page is captured too. */
	onSelection: (text: string, tabId: number) => void
	/**
	 * A nudge too: the prompt lives in the worker, and an open panel drains it with
	 * `takeOmniboxPrompt`. Sending it in the event would deliver it twice when the boot
	 * drain lands at the same moment.
	 */
	onPromptAdd: () => void
}

/** Wire background events into the app. Returns an unsubscribe function. */
export function initBrowserEvents(handlers: BrowserEventHandlers): () => void {
	return onBackgroundEvent((event) => {
		switch (event.type) {
			case 'page.add':
				handlers.onPageAdd()
				break
			case 'prompt.add':
				handlers.onPromptAdd()
				break
			case 'selection.add':
				handlers.onSelection(event.text, event.tabId)
				break
		}
	})
}
