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
import type { TabAttachment } from '../browser/tools'
import type { TabInfo } from '../browser/protocol'
import { isHttpUrl } from '../core/util'
import { getChrome } from '../platform/chrome'

/**
 * The tab the panel is looking at — what the composer's add button would capture.
 *
 * Tracked here rather than asked for on each click: the click has to know which origin
 * it is asking access for, and a round trip to the worker would put another `await`
 * before the grant is requested.
 */
export const activeTabStore = new Store<TabInfo | null>(null)

/** A tab worth offering to add: a real page, with the metadata the chip shows. */
function readableTab(tab: chrome.tabs.Tab): TabInfo | null {
	if (tab.id === undefined || !isHttpUrl(tab.url)) return null
	return {
		id: tab.id,
		windowId: tab.windowId,
		url: tab.url,
		title: tab.title || tab.url,
		faviconUrl: tab.favIconUrl,
	}
}

/**
 * Keep `activeTabStore` on the tab on screen.
 *
 * The panel is an extension page, so `chrome.tabs` answers here directly, and the `tabs`
 * permission already carries the URL, title and favicon — no worker round trip and no
 * prompt. Returns an unsubscribe function.
 */
export function initActiveTabTracking(): () => void {
	const chromeApi = getChrome()
	if (!chromeApi?.tabs?.query) return () => {}

	const refresh = async (): Promise<void> => {
		try {
			const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true })
			activeTabStore.set(tab ? readableTab(tab) : null)
		} catch {
			activeTabStore.set(null)
		}
	}

	const onActivated = () => void refresh()
	// A tab keeps its id across a navigation but changes the origin the add button asks
	// access for, so both the new URL and the end of the load re-read it.
	const onUpdated = (_tabId: number, info: { url?: string; status?: string }) => {
		if (info.url || info.status === 'complete') void refresh()
	}

	void refresh()
	chromeApi.tabs.onActivated?.addListener(onActivated)
	chromeApi.tabs.onUpdated?.addListener(onUpdated)
	chromeApi.windows?.onFocusChanged?.addListener(onActivated)

	return () => {
		chromeApi.tabs.onActivated?.removeListener(onActivated)
		chromeApi.tabs.onUpdated?.removeListener(onUpdated)
		chromeApi.windows?.onFocusChanged?.removeListener(onActivated)
	}
}

/**
 * Tab a tool opened, by tool call id.
 *
 * Deliberately not part of the tool result: the model cannot read that tab yet, and a URL
 * in the result invites an answer from a page it never saw. The card is the only reader,
 * and all it needs is the tab id.
 */
export const toolTabsStore = new Store<ReadonlyMap<string, number>>(new Map())

export function recordToolTab(toolCallId: string, tabId: number): void {
	toolTabsStore.set(new Map(toolTabsStore.get()).set(toolCallId, tabId))
}

/**
 * How a tool's tab becomes a page in the chat, bound at boot.
 *
 * The work itself lives in `bootstrap` (it needs the model check, the access grant and
 * the page store), but `chat` builds the tool context and `bootstrap` already imports
 * `chat`, so the handler is handed over here instead of imported from there.
 */
type TabAttachHandler = (tabId: number, signal?: AbortSignal) => Promise<TabAttachment>

let tabAttachHandler: TabAttachHandler | null = null

export function bindTabAttach(handler: TabAttachHandler): void {
	tabAttachHandler = handler
}

/** Add the tab a tool opened to the chat, waiting for the user's answer. */
export function attachTabForTool(tabId: number, signal?: AbortSignal): Promise<TabAttachment> {
	if (!tabAttachHandler) return Promise.resolve({ attached: false, reason: 'The panel is still starting up.' })
	return tabAttachHandler(tabId, signal)
}

/** How long a tool-opened tab gets to finish loading before it is read anyway. */
const TAB_LOAD_TIMEOUT_MS = 10_000

/**
 * Wait for `tabId` to finish loading.
 *
 * A search returns the moment the navigation starts, so the page a tool just opened is
 * usually still blank or half-built when the tool runs. Capturing then would freeze an
 * empty outline and whatever text had arrived, which reads as "the results were not
 * there" even though they were a moment away.
 */
export function waitForTabLoad(tabId: number, timeoutMs = TAB_LOAD_TIMEOUT_MS): Promise<void> {
	const chromeApi = getChrome()
	if (!chromeApi?.tabs?.get) return Promise.resolve()
	return new Promise<void>((resolve) => {
		let settled = false
		const finish = () => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			chromeApi.tabs?.onUpdated?.removeListener(onUpdated)
			resolve()
		}
		const onUpdated = (updatedId: number, info: { status?: string }) => {
			if (updatedId === tabId && info.status === 'complete') finish()
		}
		const timer = setTimeout(finish, timeoutMs)
		chromeApi.tabs?.onUpdated?.addListener(onUpdated)
		// It may already have finished before this listener existed, so look once as well.
		void chromeApi.tabs?.get(tabId).then(
			(tab) => {
				if (tab?.status === 'complete') finish()
				if (tab?.discarded) finish()
			},
			// A tab that cannot be read yet is not worth waiting on; extraction reports it.
			() => finish(),
		)
	})
}

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
