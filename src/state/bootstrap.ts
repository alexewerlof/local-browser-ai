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
import { extractPage, initBrowserEvents, readTabInfo, takeOmniboxPrompt, takePendingPageTabs } from './browser'
import { findAttachedPage, nextPageHandle, pagesStore } from './pages'
import { initSettings, settingsStore } from './settings'
import { initMemory, memoryStore } from './memory'
import { refreshPromptStatus } from './prompt'
import { Store } from '../core/store'
import { enabledBuiltInTools, normalizeSettings } from '../core/settings'
import { freezePage } from '../core/context/page-block'
import type { OmniboxPrompt } from '../core/omnibox'
import { hasPageTools } from '../browser/tools'
import { getModelInfo } from '../providers/catalog'
import { toAppError } from '../providers/errors'

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
			message: 'The page tools are turned off. Enable them in Settings → Built-in Tools to add pages.',
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
export async function addPage(tabId?: number, options: AddPageOptions = {}): Promise<void> {
	if (addPageBusyStore.get()) return
	addPageBusyStore.set(true)
	addPageErrorStore.set(null)
	try {
		const info = await readTabInfo(tabId)
		if (options.reuseExisting && findAttachedPage(info.url)) return

		const readable = pageReadable()
		if (!readable.ok) {
			addPageErrorStore.set(readable.message)
			return
		}

		const { page } = await extractPage(info.id, info)
		const conversation = conversationStore.get()
		const snapshot = freezePage({ ...page, tabIdHint: info.id }, conversation.id, nextPageHandle(pagesStore.get()))
		await appendPage(snapshot)
	} catch (error) {
		addPageErrorStore.set(toAppError(error).message)
	} finally {
		addPageBusyStore.set(false)
	}
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

function queuePageAdd(tabId: number, options?: AddPageOptions): Promise<void> {
	const next = addPageChain.then(() => addPage(tabId, options))
	addPageChain = next.catch(() => undefined)
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
