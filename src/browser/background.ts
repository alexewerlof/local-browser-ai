import { AppError, toAppError } from '../providers/errors'
import { extractPageInPageContext, type InjectResult } from './extract/inject'
import {
	EVENT_FLAG,
	isRpcEnvelope,
	type BackgroundEvent,
	type BackgroundRequest,
	type BackgroundResponse,
	type SearchDisposition,
	type TabInfo,
} from './protocol'

const PENDING_PAGES_KEY = 'pendingPageTabs'
const MENU_ADD_PAGE = 'lbai-add-page'
const MENU_SELECTION = 'lbai-add-selection'
const MENU_OPEN = 'lbai-open-panel'

const RESTRICTED_URL =
	/^(chrome|edge|brave|opera|vivaldi|about|devtools|view-source|chrome-extension|moz-extension|file):/i

function log(...args: unknown[]): void {
	// `console.debug` is hidden at the default level in the service worker devtools.
	console.info('[lbai]', ...args)
}

/* --------------------------------------------------------------- panel wiring */

/**
 * The toolbar button only shows and hides the panel: pages are added from the context
 * menu. `openPanelOnActionClick: true` is exactly that, so the worker keeps it set
 * rather than trying to take over `action.onClicked`.
 */
async function ensureToolbarTogglesPanel(): Promise<void> {
	try {
		const behavior = await chrome.sidePanel.getPanelBehavior?.()
		if (behavior?.openPanelOnActionClick !== true) {
			await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
			console.info('[lbai] toolbar button toggles the panel')
		}
	} catch (error) {
		console.warn('[lbai] could not set the side panel behavior', error)
	}
}

/**
 * Tabs the user asked to add, drained by the panel as it opens. Kept in memory so a
 * panel that loads immediately can take them without racing the storage write, and in
 * session storage so a restarted worker can still answer.
 */
let pendingPageTabs: number[] = []

function queuePageTab(tabId: number): void {
	// Adding the same tab twice is a no-op, not a duplicate page.
	pendingPageTabs = [...pendingPageTabs.filter((id) => id !== tabId), tabId]
	// Fire and forget: never await before opening the panel.
	chrome.storage.session.set({ [PENDING_PAGES_KEY]: pendingPageTabs }).catch(() => {
		// `storage.session` is unavailable in some forks; memory still works.
	})
}

async function takePendingPageTabs(): Promise<number[]> {
	const fromMemory = pendingPageTabs
	pendingPageTabs = []
	if (fromMemory.length > 0) {
		chrome.storage.session.remove(PENDING_PAGES_KEY).catch(() => {})
		return fromMemory
	}
	try {
		const stored = await chrome.storage.session.get(PENDING_PAGES_KEY)
		const tabIds = stored[PENDING_PAGES_KEY]
		await chrome.storage.session.remove(PENDING_PAGES_KEY)
		return Array.isArray(tabIds) ? tabIds.filter((id): id is number => typeof id === 'number') : []
	} catch {
		return []
	}
}

function broadcast(event: BackgroundEvent): void {
	chrome.runtime.sendMessage({ [EVENT_FLAG]: true, event }).catch(() => {
		// No panel is listening; that is normal when the panel is closed.
	})
}

/**
 * Open the side panel. Must be called synchronously inside a user gesture handler, so
 * this returns nothing and never awaits.
 *
 * If the API is missing or refuses to open (older Chrome, no gesture, panel disabled),
 * fall back to the same UI in a tab so the click still does something.
 */
function openPanel(windowId: number | undefined): void {
	if (windowId === undefined) {
		console.warn('[lbai] cannot open the panel without a window id')
		return
	}
	chrome.sidePanel.open({ windowId }).catch(async (error) => {
		console.error('[lbai] sidePanel.open failed, opening a tab instead', error)
		const url = chrome.runtime.getURL('side-panel.html')
		try {
			// Matching by URL is best effort: without the `tabs` permission some URLs are
			// hidden, and a failed query must not prevent the fallback.
			const tabs = await chrome.tabs.query({}).catch(() => [])
			const existing = tabs.find((tab) => tab.url === url)
			if (existing?.id !== undefined) {
				await chrome.tabs.update(existing.id, { active: true })
				return
			}
		} catch {
			// Fall through to creating a tab.
		}
		try {
			await chrome.tabs.create({ url })
		} catch (fallbackError) {
			console.error('[lbai] could not open a fallback tab', fallbackError)
		}
	})
}

/** Add a page from a gesture: open the panel, queue the tab, tell open panels. */
function addPageFromMenu(tabId: number, windowId: number | undefined): void {
	log('add page requested for tab', tabId)
	openPanel(windowId)
	queuePageTab(tabId)
	broadcast({ type: 'page.add', tabId })
}

/* ------------------------------------------------------------------ extraction */

function assertScriptable(url: string | undefined): asserts url is string {
	if (!url) {
		throw new AppError(
			'permission',
			'The extension has no access to this tab yet. Use the right-click menu on the page to add it.',
		)
	}
	if (RESTRICTED_URL.test(url)) {
		throw new AppError('unsupported', 'Browser pages and extension pages cannot be read.')
	}
}

async function readTabInfo(tabId?: number): Promise<TabInfo> {
	const tab =
		tabId === undefined
			? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
			: await chrome.tabs.get(tabId)
	if (!tab?.id) throw new AppError('permission', 'No active tab found.')
	assertScriptable(tab.url)
	return {
		id: tab.id,
		windowId: tab.windowId,
		url: tab.url,
		title: tab.title ?? tab.url,
		faviconUrl: tab.favIconUrl,
	}
}

async function runExtraction(tabId: number | undefined, mode: 'page' | 'selection') {
	const info = await readTabInfo(tabId)
	try {
		const results = await chrome.scripting.executeScript({
			target: { tabId: info.id },
			func: extractPageInPageContext,
			args: [{ mode }],
		} as unknown as chrome.scripting.ScriptInjection)
		const result = results[0]?.result as InjectResult | undefined
		if (!result) throw new AppError('unsupported', 'The page returned no content.')
		if (result.error) throw new AppError('unsupported', result.error)
		return result
	} catch (error) {
		if (error instanceof AppError) throw error
		throw new AppError(
			'permission',
			'Could not read this page. Re-open the extension from the toolbar so it gets temporary access to the tab.',
			{ cause: error },
		)
	}
}

/* ---------------------------------------------------------------- RPC handlers */

/** `chrome.search` is Chrome 87+/Edge only and missing in some forks. */
const SEARCH_DISPOSITIONS = new Set<SearchDisposition>(['CURRENT_TAB', 'NEW_TAB', 'NEW_WINDOW'])
const MAX_SEARCH_CHARS = 400

/**
 * Run a query through the user's default search engine.
 *
 * `chrome.search.query` only navigates: it resolves with `void` and never yields the
 * results. The model is told that, so it asks the user to attach the results tab
 * instead of inventing an answer.
 */
async function runSearch(text: string, disposition: SearchDisposition): Promise<{ disposition: SearchDisposition }> {
	const query = text.trim()
	if (!query) throw new AppError('invalid-request', 'A search needs some text to look up.')
	if (query.length > MAX_SEARCH_CHARS) {
		throw new AppError('invalid-request', `A search query is limited to ${MAX_SEARCH_CHARS} characters.`)
	}
	if (!SEARCH_DISPOSITIONS.has(disposition)) {
		throw new AppError('invalid-request', 'Unknown search disposition.')
	}

	const searchApi = (chrome as { search?: typeof chrome.search }).search
	if (!searchApi?.query) {
		throw new AppError('unsupported', 'This browser cannot search with the default search engine.')
	}

	await searchApi.query({ text: query, disposition })
	return { disposition }
}

/** Same page, hash included. */
function sameUrl(current: string | undefined, target: string): boolean {
	return Boolean(current) && current === target
}

/** Same page, ignoring the fragment, so a card still finds the tab on another anchor. */
function sameDocument(current: string | undefined, target: string): boolean {
	if (!current) return false
	try {
		const left = new URL(current)
		const right = new URL(target)
		return left.origin === right.origin && left.pathname === right.pathname && left.search === right.search
	} catch {
		return false
	}
}

async function activateTab(tab: chrome.tabs.Tab): Promise<void> {
	if (tab.id === undefined) return
	try {
		await chrome.windows.update(tab.windowId, { focused: true })
	} catch {
		// The window may be gone; activating the tab still helps.
	}
	await chrome.tabs.update(tab.id, { active: true })
}

/**
 * Bring the page a card stands for back on screen.
 *
 * The hint is the tab it was captured from, which is only useful while that tab still
 * shows the page: Chrome reuses tab ids, and a page can be reached from any tab. Fall
 * back to any open tab showing it, and only then open a new one.
 */
async function focusPage(tabId: number | undefined, url: string): Promise<{ tabId?: number }> {
	if (!/^https?:\/\//i.test(url)) {
		throw new AppError('invalid-request', 'Only http and https links can be opened.')
	}
	if (tabId !== undefined) {
		try {
			const tab = await chrome.tabs.get(tabId)
			if (sameUrl(tab.url, url) || sameDocument(tab.url, url)) {
				await activateTab(tab)
				return { tabId: tab.id }
			}
		} catch {
			// The tab was closed; look for another one.
		}
	}

	const tabs = await chrome.tabs.query({}).catch(() => [])
	const match = tabs.find((tab) => sameUrl(tab.url, url)) ?? tabs.find((tab) => sameDocument(tab.url, url))
	if (match) {
		await activateTab(match)
		return { tabId: match.id }
	}

	const created = await chrome.tabs.create({ url })
	return { tabId: created.id }
}

async function handleRequest(request: BackgroundRequest): Promise<unknown> {
	switch (request.type) {
		case 'page.pending':
			return { tabIds: await takePendingPageTabs() }
		case 'page.focus':
			return focusPage(request.tabId, request.url)
		case 'tab.info':
			return readTabInfo(request.tabId)
		case 'tab.extract':
			return runExtraction(request.tabId, 'page')
		case 'tab.selection': {
			const result = await runExtraction(request.tabId, 'selection')
			return { text: result.selection }
		}
		case 'tab.open': {
			const url = request.url
			if (!/^https?:\/\//i.test(url)) {
				throw new AppError('invalid-request', 'Only http and https links can be opened.')
			}
			if (request.newWindow) {
				const created = await chrome.windows.create({ url, focused: true })
				return { tabId: created?.tabs?.[0]?.id }
			}
			const tab = await chrome.tabs.create({ url })
			return { tabId: tab.id }
		}
		case 'search.query':
			return runSearch(request.text, request.disposition)
		default:
			throw new AppError('invalid-request', 'Unknown request.')
	}
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (!isRpcEnvelope(message)) return false
	log('rpc', message.request.type)
	void handleRequest(message.request)
		.then((value): BackgroundResponse => ({ ok: true, value }))
		.catch((error): BackgroundResponse => {
			const appError = toAppError(error)
			console.warn('[lbai] rpc failed', message.request.type, appError.kind, appError.message)
			return { ok: false, error: { kind: appError.kind, message: appError.message } }
		})
		.then(sendResponse)
	return true
})

/* ---------------------------------------------------------------- action + menus */

function createMenus(): void {
	chrome.contextMenus.removeAll(() => {
		chrome.contextMenus.create({
			id: MENU_ADD_PAGE,
			title: 'Add this page to chat',
			contexts: ['page', 'selection'],
		})
		chrome.contextMenus.create({
			id: MENU_SELECTION,
			title: 'Add selection to chat',
			contexts: ['selection'],
		})
		chrome.contextMenus.create({ id: MENU_OPEN, title: 'Open chat', contexts: ['page', 'selection'] })
	})
}

chrome.runtime.onInstalled.addListener((details) => {
	log('installed', details.reason, chrome.runtime.getManifest().version)
	createMenus()
	void ensureToolbarTogglesPanel()
})
chrome.runtime.onStartup.addListener(() => {
	log('browser startup')
	createMenus()
	void ensureToolbarTogglesPanel()
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
	log('menu click', info.menuItemId, tab?.id)
	if (tab?.id === undefined) return
	if (info.menuItemId === MENU_SELECTION) {
		const text = info.selectionText?.trim()
		if (!text) return
		openPanel(tab.windowId)
		broadcast({
			type: 'selection.add',
			text,
			tabId: tab.id,
			url: info.pageUrl ?? tab.url ?? '',
			title: tab.title ?? '',
		})
		return
	}
	if (info.menuItemId === MENU_ADD_PAGE) {
		addPageFromMenu(tab.id, tab.windowId)
		return
	}
	if (info.menuItemId === MENU_OPEN) openPanel(tab.windowId)
})

/* ------------------------------------------------------------------- bootstrap */

// Runs on every worker start, so a profile that still carries the old behavior is
// repaired even before the next install/startup event.
log('worker started')
void ensureToolbarTogglesPanel()
