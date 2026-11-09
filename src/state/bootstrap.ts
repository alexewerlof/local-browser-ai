import {
	appendPage,
	conversationStore,
	flushPersistence,
	newChat,
	refreshContext,
	restoreLastConversation,
	setModel,
	submitPrompt,
} from './chat'
import { addPageBusyStore, addPageErrorStore, quoteSelection, setDraft } from './composer'
import {
	activeTabStore,
	bindTabAttach,
	extractPage,
	initActiveTabTracking,
	initBrowserEvents,
	readTabInfo,
	takeOmniboxPrompt,
	takePendingPageTabs,
	waitForTabLoad,
} from './browser'
import { findAttachedPage, nextPageHandle, pagesStore } from './pages'
import { initSettings, settingsStore } from './settings'
import { initMemory, memoryStore } from './memory'
import { refreshPromptStatus } from './prompt'
import { Store } from '../core/store'
import { enabledBuiltInTools, normalizeSettings } from '../core/settings'
import { freezePage } from '../core/context/page-block'
import type { OmniboxPrompt } from '../core/omnibox'
import type { PageSource } from '../core/types'
import type { PageSnapshot } from '../core/types'
import { hasPageTools, type TabAttachment } from '../browser/tools'
import type { TabInfo } from '../browser/protocol'
import { getModelInfo } from '../providers/catalog'
import { toAppError } from '../providers/errors'
import {
	addHostAccessRequest,
	grantsOrigin,
	hasHostAccess,
	onHostAccessGranted,
	removeHostAccessRequest,
	requestHostAccess,
	supportsHostAccessRequest,
} from '../platform/permissions'

/**
 * Whether the panel has finished opening.
 *
 * Settings alone cannot gate the first paint any more: the panel reopens on the chat it
 * was showing, and rendering the brand-new chat first would flash its title and empty
 * transcript before the saved one lands. The first paint waits for the whole boot.
 */
export const bootStatusStore = new Store<'loading' | 'ready'>('loading')

/**
 * Pages are only useful to a model that can read them on demand: the block carries the
 * outline and the handle, and the text stays behind the page tools. A model without
 * them would answer from an outline it cannot expand, so the add is refused instead of
 * silently producing a chat that cannot be grounded.
 */
function pageReadable(): { ok: true } | { ok: false; message: string } {
	const settings = normalizeSettings(settingsStore.get())
	const ref = conversationStore.get().model ?? settings.defaultModel
	if (!ref) return { ok: false, message: 'Choose a model in Settings before adding a page.' }

	const provider = settings.providers.find((entry) => entry.id === ref.providerId)
	if (!provider) {
		return { ok: false, message: 'The selected provider was removed. Pick another model in Settings.' }
	}

	const info = getModelInfo(provider.kind, provider.kind === 'prompt-api' ? 'text' : ref.modelId)
	if (!info.capabilities.tools) {
		return {
			ok: false,
			message: 'This model cannot call tools, so it could not read a page. Pick a model with tool support.',
		}
	}
	if (!hasPageTools(enabledBuiltInTools(settings))) {
		return {
			ok: false,
			message: 'The page tools are turned off. Enable them in Settings → Tools to add pages.',
		}
	}
	return { ok: true }
}

export interface AddPageOptions {
	/**
	 * Skip the capture when the same document is already in the chat.
	 *
	 * Only a selection passes this: quoting a passage is not a request for another copy
	 * of its page, and every quote would otherwise cost a second page block. An explicit
	 * add never sets it — see `addPage`.
	 */
	reuseExisting?: boolean
	/**
	 * Where the page comes from. `search` marks the results a tool captured for its own
	 * use: the model reads them like any page, but they are not a reference the user
	 * added, so the list and the transcript leave them out.
	 */
	source?: PageSource
}

/**
 * Capture one tab and append it to the chat on screen.
 *
 * An explicit add always captures, even for a document that is already in the chat: a
 * right-click on a page the user has already added is a request for *this* version, so
 * the new capture becomes the next handle (`p2`) beside the earlier one. That is what
 * makes "what changed on this page?" answerable, and it costs nothing when the page has
 * not changed — the two blocks are small, and their text lives outside the prompt.
 */
export async function addPage(tabId?: number, options: AddPageOptions = {}): Promise<PageSnapshot | undefined> {
	if (addPageBusyStore.get()) return undefined
	addPageBusyStore.set(true)
	addPageErrorStore.set(null)
	try {
		const info = await readTabInfo(tabId)
		if (options.reuseExisting && findAttachedPage(info.url)) return undefined

		const readable = pageReadable()
		if (!readable.ok) {
			addPageErrorStore.set(readable.message)
			return undefined
		}

		const { page } = await extractPage(info.id, info)
		const conversation = conversationStore.get()
		const snapshot = freezePage(
			{ ...page, tabIdHint: info.id },
			conversation.id,
			nextPageHandle(pagesStore.get()),
			options.source,
		)
		await appendPage(snapshot)
		return snapshot
	} catch (error) {
		addPageErrorStore.set(toAppError(error).message)
		return undefined
	} finally {
		addPageBusyStore.set(false)
	}
}

/* --------------------------------------------------------------- page access */

/**
 * A page waiting for the user to allow access to its site.
 *
 * Chrome's chip has no "denied" event: a dismissed chip and an ignored one look the same
 * from here, so the entry stays until the grant arrives or the user cancels it.
 */
export interface PendingPageAccess {
	tabId: number
	url: string
	/**
	 * Whether Chrome was handed a chip to show.
	 *
	 * `addHostAccessRequest` resolves `void` and reports nothing, so this records the
	 * attempt rather than a result: the banner offers its own button either way, because
	 * there is no way to know from here whether anything appeared in the address bar.
	 */
	chip: boolean
	/** Where the page comes from, kept so the grant that finally captures it still knows. */
	source?: PageSource
}

export const pageAccessStore = new Store<PendingPageAccess | null>(null)

/**
 * Tools waiting for the user to decide about a tab, by tab id.
 *
 * One entry per tab is enough: an access request belongs to a tab, and asking twice for
 * the same one would put two chips on it.
 */
const accessWaiters = new Map<number, (attachment: TabAttachment) => void>()

function settleAccess(tabId: number, attachment: TabAttachment): void {
	const waiter = accessWaiters.get(tabId)
	accessWaiters.delete(tabId)
	waiter?.(attachment)
}

function waitForAccess(tabId: number, signal?: AbortSignal): Promise<TabAttachment> {
	return new Promise<TabAttachment>((resolve) => {
		accessWaiters.set(tabId, resolve)
		// Stop is the way out of a request the user never answers; without it the tool call,
		// and with it the run, would wait for ever.
		signal?.addEventListener(
			'abort',
			() => settleAccess(tabId, { attached: false, reason: 'The user stopped the run.' }),
			{
				once: true,
			},
		)
	})
}

/**
 * Finish an add that was allowed: capture the page, then answer whoever is waiting.
 *
 * Every grant ends up here — the chip, the banner's button, the composer's button — so a
 * tool call is settled by the same attach that the user sees in the page strip. A grant
 * can also arrive twice, because `permissions.request()` resolving true and `onAdded`
 * firing for the same origins both report it, so the captures are shared per tab.
 */
const grantsInFlight = new Map<number, Promise<TabAttachment>>()

function grantAccess(tabId: number, source: PageSource = 'user'): Promise<TabAttachment> {
	const running = grantsInFlight.get(tabId)
	if (running) return running

	const grant = (async (): Promise<TabAttachment> => {
		if (pageAccessStore.get()?.tabId === tabId) pageAccessStore.set(null)
		const page = await queuePageAdd(tabId, { source })
		const attachment: TabAttachment = page
			? { attached: true, page: page.handle }
			: { attached: false, reason: 'The page could not be read.' }
		settleAccess(tabId, attachment)
		return attachment
	})()

	grantsInFlight.set(tabId, grant)
	return grant.finally(() => {
		grantsInFlight.delete(tabId)
	})
}

/**
 * Add the page in `tabId`, asking for access to its site when that is not granted yet.
 *
 * This is the path for a tab a tool opened. Reading that tab costs an `await`, and the
 * modal grant only answers while a click's gesture is still live, so by the time we get
 * here there is none left. What remains is the address-bar chip (`addHostAccessRequest`,
 * Chrome 133+), which needs no gesture — and nothing happens when the browser will not
 * show one, which is why the banner carries its own button. The composer's own button
 * does not come through here; see `addCurrentPage`.
 */
export async function addPageWithAccess(tabId: number, url: string): Promise<void> {
	if (await hasHostAccess(url)) {
		await grantAccess(tabId)
		return
	}

	if (supportsHostAccessRequest() && (await addHostAccessRequest(tabId))) {
		pageAccessStore.set({ tabId, url, chip: true })
		return
	}

	if (await requestHostAccess(url)) {
		await grantAccess(tabId)
		return
	}

	// A browser without a chip can never show anything from here, so the page cannot be
	// added at all unless the user goes through the context menu instead.
	pageAccessStore.set({ tabId, url, chip: false })
}

/**
 * Add the page on screen — the composer's add button.
 *
 * The click is the only gesture this flow gets, and `permissions.request` has to be the
 * first thing it does: an `await` before the call has already spent the gesture. That is
 * why the panel tracks the active tab (`activeTabStore`) instead of reading it here — the
 * URL is already in hand, so the dialog is the first thing the click does. The dialog is
 * also the only grant the user is guaranteed to see, unlike the address-bar chip, which a
 * browser may quietly decline to show.
 */
export async function addCurrentPage(): Promise<void> {
	const tab = activeTabStore.get()
	if (!tab) {
		addPageErrorStore.set('There is no page on screen to add. Open a website, then try again.')
		return
	}

	if (await requestHostAccess(tab.url)) {
		await grantAccess(tab.id)
		return
	}

	// No dialog: the user dismissed it, or the browser would not open one from here. The
	// chip can still be offered, and the banner then carries a button that asks again.
	await addPageWithAccess(tab.id, tab.url)
}

/**
 * The pending banner's Allow button.
 *
 * Its click is a fresh gesture, so the modal can be asked for again even when the request
 * that opened the banner had none. Nothing is cleared before the answer is known: the
 * banner has to stay on screen when the dialog is dismissed without an answer.
 */
export async function allowPageAccess(): Promise<void> {
	const pending = pageAccessStore.get()
	if (!pending) return
	if (!(await requestHostAccess(pending.url))) return
	await removeHostAccessRequest(pending.tabId)
	await grantAccess(pending.tabId, pending.source)
}

/**
 * The "Add page to chat" button on a tool card.
 *
 * When the tool is still waiting for access to that tab this is the same decision the
 * banner's Allow button makes — only the control is different. It has to go through
 * `allowPageAccess`: offering the chip again would return without settling the waiting
 * call, which is a button that looks dead and a run that never resumes.
 */
export async function addTabPage(tabId: number): Promise<void> {
	if (pageAccessStore.get()?.tabId === tabId) {
		await allowPageAccess()
		return
	}
	try {
		const info = await readTabInfo(tabId)
		await addPageWithAccess(info.id, info.url)
	} catch (error) {
		addPageErrorStore.set(toAppError(error).message)
	}
}

/** Take the request back: the chip disappears, nothing is added, and a waiting tool is told. */
export async function cancelPageAccess(): Promise<void> {
	const pending = pageAccessStore.get()
	pageAccessStore.set(null)
	if (!pending) return
	settleAccess(pending.tabId, { attached: false, reason: 'The user did not allow access to that site.' })
	await removeHostAccessRequest(pending.tabId)
}

/**
 * The user allowed a site: add the page that was waiting for it.
 *
 * The origins come from the browser rather than from the request, so they are matched
 * against the pending page's own pattern instead of compared as strings.
 */
async function completePageAccess(origins: string[]): Promise<void> {
	const pending = pageAccessStore.get()
	if (!pending || !grantsOrigin(origins, pending.url)) return
	await grantAccess(pending.tabId, pending.source)
}

/**
 * Attach the tab a tool opened, waiting for the user to decide first.
 *
 * A search is not finished when Chrome opens a tab: the model cannot read that tab until
 * its origin is granted, so the tool call stays open until the user answers. That is the
 * whole point — a result saying "ask the user to add the tab" ends the turn, and by the
 * time the grant arrives the model has already given up on the page. Approving attaches
 * the page here, so the next step of the same run can read it.
 *
 * `read_page` with a URL uses the same pipeline: it opens a page and the model must not
 * carry on guessing before that page is either in the chat or explicitly refused.
 *
 * No gesture is left by the time a tool runs, so the modal cannot be asked for: the
 * address-bar chip is offered, and the banner carries a button whose own click is one.
 */
export async function attachToolTab(
	tabId: number,
	signal?: AbortSignal,
	source: PageSource = 'user',
): Promise<TabAttachment> {
	// The tab was created a moment ago and is still loading; reading it now would capture
	// an empty document and settle the call on nothing.
	await waitForTabLoad(tabId)
	if (signal?.aborted) return { attached: false, reason: 'The user stopped the run.' }

	let info: TabInfo
	try {
		info = await readTabInfo(tabId)
	} catch (error) {
		return { attached: false, reason: toAppError(error).message }
	}

	// A page is only worth attaching for a model that can read it. Asking for the grant
	// first would make the user allow a whole site for nothing.
	const readable = pageReadable()
	if (!readable.ok) return { attached: false, reason: readable.message }

	if (await hasHostAccess(info.url)) return grantAccess(tabId, source)

	const answer = waitForAccess(tabId, signal)
	const offered = supportsHostAccessRequest() && (await addHostAccessRequest(tabId))
	pageAccessStore.set({ tabId, url: info.url, chip: offered, source })
	return answer
}

/**
 * Add a selection: the quote goes into the draft, and the page it came from is captured
 * so the model knows the title and URL and can read the rest of the page with the page
 * tools. The quote lands even when the capture is refused (a model without tools), since
 * the selected text alone is still useful. A page already in the chat is reused rather
 * than captured again.
 */
async function addSelection(text: string, tabId: number): Promise<void> {
	quoteSelection(text)
	await queuePageAdd(tabId, { reuseExisting: true })
}

/**
 * Page adds run one at a time.
 *
 * `addPage` returns early while another capture is running, which is what keeps the
 * panel from capturing twice; but the boot drain, the context-menu nudge and an omnibox
 * prompt can all ask for one in the same tick, and a dropped add is invisible to the
 * user. Chaining them makes the busy guard unreachable from here.
 */
let addPageChain: Promise<void> = Promise.resolve()

function queuePageAdd(tabId: number, options?: AddPageOptions): Promise<PageSnapshot | undefined> {
	const next = addPageChain.then(() => addPage(tabId, options))
	addPageChain = next.then(
		() => undefined,
		() => undefined,
	)
	return next
}

/** Add every page the user asked for while the panel was not listening. */
async function drainPendingPages(): Promise<void> {
	const tabIds = await takePendingPageTabs()
	for (const tabId of tabIds) await queuePageAdd(tabId)
}

/* ------------------------------------------------------------- omnibox prompts */

/**
 * One omnibox prompt at a time. The worker hands an entry over only once, but a nudge
 * that lands while the boot drain is already taking would still have both waiting on the
 * same entry, so the drains share one chain.
 */
let omniboxChain: Promise<void> = Promise.resolve()

function drainOmniboxPrompt(): Promise<void> {
	const next = omniboxChain.then(runPendingOmniboxPrompt, runPendingOmniboxPrompt)
	omniboxChain = next.catch(() => undefined)
	return next
}

async function runPendingOmniboxPrompt(): Promise<void> {
	const prompt = await takeOmniboxPrompt()
	if (prompt) await startOmniboxChat(prompt)
}

/**
 * Run a prompt accepted in the address bar: a new chat, the page it was typed on, and
 * the prompt sent.
 *
 * The page is added *before* the turn, not as part of it: `startTurn` claims pending
 * pages into the new user message, so the first request already carries the frozen block
 * exactly as if the page had been added from the context menu.
 */
async function startOmniboxChat(prompt: OmniboxPrompt): Promise<void> {
	// Asking for this chat is asking not to stay in the one on screen, which is stopped
	// and stays in Chats.
	newChat()
	// A page that could not be read puts its message above the composer; the prompt is
	// still what the user typed, so it is sent either way.
	if (prompt.tabId !== undefined) await queuePageAdd(prompt.tabId)
	if (!conversationStore.get().model) {
		// Nothing can run without a model, and losing the typed prompt to a failed turn
		// would be worse than handing it back to the composer.
		setDraft(prompt.text)
		return
	}
	void submitPrompt(prompt.text)
}

export async function bootstrap(): Promise<void> {
	await initSettings()
	await initMemory()
	// The add button needs to know which page it would capture before it can ask for
	// access to that page's site, so tracking starts with the rest of the panel.
	initActiveTabTracking()
	// A tool that opens a tab (`search_web`, `read_page` with a url) hands it here to be
	// attached, and waits for the answer so the same run can read the page it found.
	bindTabAttach(attachToolTab)

	// A prompt accepted in the address bar asks for a new chat, so the chat the panel was
	// showing is not reopened: it would be replaced a moment later, and a long transcript
	// is a lot to load just to throw away. One attempt only, so a panel opened any other
	// way does not pay a retry delay before its first paint; the drain at the end of the
	// boot covers a prompt that lands a moment later.
	const omniboxPrompt = await takeOmniboxPrompt(1)
	if (!omniboxPrompt) {
		// The panel reopens on the chat it was showing. Restoring before the browser events
		// are wired keeps a page add from landing in the chat that is about to be replaced;
		// the worker queues those tabs, so `drainPendingPages` still delivers them.
		try {
			await restoreLastConversation()
		} catch {
			// A failed restore must not cost the panel its event wiring: the next chat still
			// works, it is simply new.
		}
	}

	const settings = settingsStore.get()
	const conversation = conversationStore.get()
	if (!conversation.model && settings.defaultModel) setModel(settings.defaultModel)

	// The worker both queues a tab and broadcasts `page.add`, so both paths drain the same
	// queue: whichever arrives first adds the page, and the other one finds it gone. An
	// omnibox prompt is nudged the same way, and the prompt itself stays in the worker.
	initBrowserEvents({
		onPageAdd: () => void drainPendingPages(),
		onSelection: (text, tabId) => void addSelection(text, tabId),
		onPromptAdd: () => void drainOmniboxPrompt(),
	})

	// A site the user allowed is the answer to a pending add, whichever prompt asked for
	// it: the chip in the toolbar, or the modal on a browser without one.
	onHostAccessGranted((origins) => void completePageAccess(origins))

	settingsStore.subscribe(() => {
		const current = settingsStore.get()
		const active = conversationStore.get()
		if (active.model && !current.providers.some((provider) => provider.id === active.model?.providerId)) {
			if (current.defaultModel) setModel(current.defaultModel)
		}
		refreshContext()
	})

	// Editing a memory in Settings changes what the next request carries, so the meter
	// and the outgoing prompt must be recomputed.
	memoryStore.subscribe(() => refreshContext())

	// Pages are bound by the restore above, and a fresh chat starts with none.
	refreshContext()

	const activeModel = conversationStore.get().model
	if (activeModel?.providerId === 'prompt-api') void refreshPromptStatus()

	// Last, with settings, the default model and the event wiring in place. An omnibox
	// prompt wins over a page queued by the context menu: it asks for a new chat, and
	// adding the page first would capture it only to throw it away.
	if (omniboxPrompt) {
		await startOmniboxChat(omniboxPrompt)
	} else {
		// A context-menu click that happened before the panel finished loading.
		await drainPendingPages()
		// The entry may have been stored after the take above, and the nudge that came with
		// it is only useful once the event wiring exists — which it did not, a moment ago.
		void drainOmniboxPrompt()
	}

	window.addEventListener('pagehide', () => void flushPersistence())
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') void flushPersistence()
	})

	bootStatusStore.set('ready')
}
