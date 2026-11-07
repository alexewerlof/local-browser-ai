import { AppError, toAppError } from '../providers/errors'
import { readPendingOmniboxPrompt, normalizeOmniboxPrompt, OMNIBOX_SUGGESTION } from '../core/omnibox'
import type { OmniboxPrompt } from '../core/omnibox'
import { delay } from '../core/util'
import { planSearch } from '../core/search'
import { extractPageInPageContext, type InjectResult } from './extract/inject'
import {
	EVENT_FLAG,
	isRpcEnvelope,
	type BackgroundEvent,
	type BackgroundRequest,
	type BackgroundResponse,
	type SearchDisposition,
	type SearchResult,
	type TabInfo,
} from './protocol'

const PENDING_PAGES_KEY = 'pendingPageTabs'
const PENDING_PROMPT_KEY = 'pendingOmniboxPrompt'
const MENU_ADD = 'lbai-add'

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

/**
 * Tell open panels what happened. Resolves `true` only when a panel answered: with no
 * receiver at all `sendMessage` rejects, which is the only way to tell "the panel is
 * closed" from "the panel already has it".
 */
async function broadcast(event: BackgroundEvent): Promise<boolean> {
	try {
		await chrome.runtime.sendMessage({ [EVENT_FLAG]: true, event })
		return true
	} catch {
		// No panel is listening; that is normal when the panel is closed.
		return false
	}
}

/** The panel as a tab: the same UI when the sidebar cannot be shown. */
async function openPanelTab(): Promise<void> {
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
}

/**
 * Show the side panel. Call it synchronously inside a gesture handler and keep the
 * promise: awaiting anything first, even a `tabs.query`, loses the gesture.
 *
 * Never throws, so a caller can start it before its own async work: a missing API or a
 * missing window is reported as a rejection and handled like a refusal.
 */
function openSidePanel(windowId: number | undefined): Promise<void> {
	if (windowId === undefined) return Promise.reject(new Error('No window to open the panel in.'))
	try {
		return chrome.sidePanel.open({ windowId })
	} catch (error) {
		return Promise.reject(error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Open the panel from the context menu.
 *
 * If the API is missing or refuses to open (older Chrome, no gesture, panel disabled),
 * fall back to the same UI in a tab so the click still does something.
 */
function openPanel(windowId: number | undefined): void {
	if (windowId === undefined) {
		console.warn('[lbai] cannot open the panel without a window id')
		return
	}
	openSidePanel(windowId).catch((error) => {
		console.error('[lbai] sidePanel.open failed, opening a tab instead', error)
		void openPanelTab()
	})
}

/**
 * Add from a gesture: open the panel, queue the tab, tell open panels.
 *
 * A selection is sent *alongside* the page, never instead of it: the panel quotes the
 * text into the draft and captures the page it came from, so the model knows the title
 * and URL and can read the rest of the page with the page tools.
 */
function addFromMenu(
	tabId: number,
	windowId: number | undefined,
	selection?: { text: string; url: string; title: string },
): void {
	log('add page requested for tab', tabId)
	openPanel(windowId)
	queuePageTab(tabId)
	void broadcast({ type: 'page.add', tabId })
	if (selection) void broadcast({ type: 'selection.add', tabId, ...selection })
}

/* -------------------------------------------------------------------- omnibox */

/**
 * The window the address bar belonged to, remembered so the panel can be opened *before*
 * the handler awaits anything. A cold worker learns it on start; both paths are best
 * effort, and the tab fallback covers the case where neither is ready.
 */
let focusedWindowId: number | undefined

chrome.windows.onFocusChanged.addListener((windowId) => {
	if (windowId === chrome.windows.WINDOW_ID_NONE) return
	focusedWindowId = windowId
})

void chrome.windows
	.getLastFocused({ populate: false })
	.then((window) => {
		if (window.id !== undefined) focusedWindowId = window.id
	})
	.catch(() => {
		// Without a window id the handler opens nothing and the fallback takes over.
	})

/**
 * The prompt accepted in the address bar, newest wins.
 *
 * One slot rather than a queue: two lines typed in a row mean the second one, and a
 * queue would start one chat per line.
 */
let pendingOmniboxPrompt: OmniboxPrompt | null = null

/** Serializes taking, so the boot drain and an event nudge cannot both take one entry. */
let promptChain: Promise<unknown> = Promise.resolve()

function queueOmniboxPrompt(prompt: OmniboxPrompt): void {
	pendingOmniboxPrompt = prompt
	// Fire and forget: the in-memory copy is read first, and `storage.session` only has to
	// survive a worker restart.
	chrome.storage.session.set({ [PENDING_PROMPT_KEY]: prompt }).catch(() => {
		// `storage.session` is unavailable in some forks; memory still works.
	})
}

async function readAndClearPrompt(): Promise<OmniboxPrompt | null> {
	const fromMemory = readPendingOmniboxPrompt(pendingOmniboxPrompt)
	if (fromMemory) {
		pendingOmniboxPrompt = null
		chrome.storage.session.remove(PENDING_PROMPT_KEY).catch(() => {})
		return fromMemory
	}
	try {
		const stored = await chrome.storage.session.get(PENDING_PROMPT_KEY)
		// A submit that landed while the read was in flight is newer than the stored one.
		const arrived = readPendingOmniboxPrompt(pendingOmniboxPrompt)
		const prompt = arrived ?? readPendingOmniboxPrompt(stored[PENDING_PROMPT_KEY])
		if (arrived) pendingOmniboxPrompt = null
		await chrome.storage.session.remove(PENDING_PROMPT_KEY)
		return prompt
	} catch {
		return null
	}
}

function takePendingOmniboxPrompt(): Promise<OmniboxPrompt | null> {
	const take = promptChain.then(readAndClearPrompt, readAndClearPrompt)
	promptChain = take.catch(() => undefined)
	return take
}

/** The active tab, without the scriptability checks the extraction path makes. */
async function activeTabId(): Promise<number | undefined> {
	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
		return tab?.id
	} catch {
		return undefined
	}
}

/**
 * A prompt accepted in the address bar: a new chat on the current page.
 *
 * Same handoff as "Add to chat" — store the entry, nudge the panel — because an open
 * panel and one that boots from this click must take the same single entry. Accepting a
 * suggestion is a user gesture, so the sidebar is attempted first and the panel-as-a-tab
 * fallback runs only when neither the sidebar nor an open panel took the prompt.
 */
function enterOmniboxPrompt(text: string, disposition: chrome.omnibox.OnInputEnteredDisposition): void {
	const content = normalizeOmniboxPrompt(text)
	if (!content) return
	log('omnibox prompt', disposition)

	// Start the open before anything is awaited, so the gesture is still alive.
	const opening = openSidePanel(focusedWindowId).then(
		() => true,
		(error: unknown) => {
			console.warn('[lbai] sidePanel.open from the omnibox failed', error)
			return false
		},
	)

	void (async () => {
		const tabId = await activeTabId()
		const prompt: OmniboxPrompt = { text: content, createdAt: Date.now() }
		if (tabId !== undefined) prompt.tabId = tabId
		queueOmniboxPrompt(prompt)

		// Alt+Enter asks for a tab, which is also the way out when the sidebar refuses.
		if (disposition === 'newForegroundTab') {
			await openPanelTab()
			return
		}
		const delivered = await broadcast({ type: 'prompt.add' })
		if (!(await opening) && !delivered) await openPanelTab()
	})()
}

/**
 * The keyword itself lives in the manifest, which is the only place Chrome reads it;
 * the description row does not survive a worker restart, so it is set on every start.
 */
function ensureOmniboxSuggestion(): void {
	try {
		void chrome.omnibox.setDefaultSuggestion({ description: OMNIBOX_SUGGESTION }).catch(() => {
			// The omnibox API is missing in some forks; the keyword still works without it.
		})
	} catch {
		// Same: no suggestion row is a cosmetic loss.
	}
}

chrome.omnibox.onInputEntered.addListener(enterOmniboxPrompt)

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
/** The tab this extension last searched in, so a second search reuses it. */
const SEARCH_TAB_KEY = 'searchTabId'

async function rememberedSearchTab(): Promise<number | undefined> {
	try {
		const stored = await chrome.storage.session.get(SEARCH_TAB_KEY)
		const id = stored[SEARCH_TAB_KEY]
		if (typeof id !== 'number') return undefined
		// A tab the user closed must not be navigated; `get` throws for it.
		await chrome.tabs.get(id)
		return id
	} catch {
		return undefined
	}
}

async function rememberSearchTab(tabId: number | undefined): Promise<void> {
	try {
		if (tabId === undefined) await chrome.storage.session.remove(SEARCH_TAB_KEY)
		else await chrome.storage.session.set({ [SEARCH_TAB_KEY]: tabId })
	} catch {
		// Losing the hint only costs one extra tab.
	}
}

/**
 * Run a query through the user's default search engine.
 *
 * `chrome.search.query` only navigates: it resolves with `void` and never yields the
 * results. The tab it opened is found by diffing the tab list instead, so the panel can
 * offer to add that page; the model is still told nothing about it, because it cannot
 * read it and a URL in the tool result invites an answer from a page it never saw.
 *
 * A `NEW_TAB` search reuses the tab the previous search opened, because one search per
 * conversation is the normal case and a fresh tab each time litters the window. Reuse
 * needs `CURRENT_TAB` — Chrome navigates the active tab — so the remembered tab is
 * activated first. `CURRENT_TAB` from the caller is left alone: that is the user's page.
 */
async function runSearch(text: string, disposition: SearchDisposition): Promise<SearchResult> {
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

	const reusable = await rememberedSearchTab()
	const plan = planSearch(disposition, reusable)
	if (plan.tabId !== undefined) {
		await chrome.tabs.update(plan.tabId, { active: true })
		await searchApi.query({ text: query, disposition: plan.disposition })
		// No new tab was opened, so there is nothing to diff: the reused tab is the answer.
		const url = await chrome.tabs.get(plan.tabId).then(
			(tab) => tab.url,
			() => undefined,
		)
		return { disposition, tabId: plan.tabId, url }
	}

	const before = await openTabIds()
	await searchApi.query({ text: query, disposition })
	const target = await searchTarget(before, disposition)
	if (disposition === 'NEW_TAB') await rememberSearchTab(target.tabId)
	return { disposition, ...target }
}

async function openTabIds(): Promise<Set<number>> {
	const tabs = await chrome.tabs.query({}).catch(() => [])
	return new Set(tabs.map((tab) => tab.id).filter((id): id is number => id !== undefined))
}

/** How long the results tab is given to appear, and how often it is looked for. */
const SEARCH_TAB_TIMEOUT_MS = 3000
const SEARCH_TAB_POLL_MS = 80

/**
 * The tab the results landed in.
 *
 * `query()` resolves as the navigation *starts*, so a single `tabs.query()` right after it
 * can miss a tab that is not in the list yet — and the old code then fell back to "the
 * active tab", which is still the page the user was reading. That wrong tab is what the
 * card's add button pointed at, and capturing it looked like the search had finished
 * before the results even existed. So a new tab is polled for, and never guessed.
 */
async function searchTarget(
	before: Set<number>,
	disposition: SearchDisposition,
): Promise<{ tabId?: number; url?: string }> {
	const deadline = Date.now() + SEARCH_TAB_TIMEOUT_MS
	for (;;) {
		const tabs = await chrome.tabs.query({}).catch(() => [])
		// `CURRENT_TAB` reuses the page on screen, so there the active tab *is* the answer.
		const tab =
			disposition === 'CURRENT_TAB'
				? tabs.find((entry) => entry.active)
				: tabs.find((entry) => entry.id !== undefined && !before.has(entry.id))
		if (tab?.id !== undefined) return { tabId: tab.id, url: tab.url }
		if (Date.now() >= deadline) return {}
		await delay(SEARCH_TAB_POLL_MS)
	}
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
		case 'prompt.pending':
			return { prompt: await takePendingOmniboxPrompt() }
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

/**
 * One item on purpose. Chrome collapses two visible items from one extension into a
 * parent submenu, and an item cannot be retitled as the menu opens: Chrome has no
 * `contextMenus.onShown` (that event exists only in Firefox). So the label stays the same
 * in both cases and the click decides from `selectionText` what to do.
 *
 * There is no "Open chat" item: the toolbar button already shows and hides the panel.
 */
function createMenus(): void {
	chrome.contextMenus.removeAll(() => {
		chrome.contextMenus.create({ id: MENU_ADD, title: 'Add to chat', contexts: ['page', 'selection'] })
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
	if (tab?.id === undefined || info.menuItemId !== MENU_ADD) return

	// The page is always added, so the item's title is literally true; a selection only
	// adds a quote of the passage on top of it.
	const text = info.selectionText?.trim() ?? ''
	addFromMenu(
		tab.id,
		tab.windowId,
		text ? { text, url: info.pageUrl ?? tab.url ?? '', title: tab.title ?? '' } : undefined,
	)
})

/* ------------------------------------------------------------------- bootstrap */

// Runs on every worker start, so a profile that still carries the old behavior is
// repaired even before the next install/startup event.
log('worker started')
void ensureToolbarTogglesPanel()
ensureOmniboxSuggestion()
