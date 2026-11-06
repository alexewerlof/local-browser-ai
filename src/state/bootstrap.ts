import {
	appendPage,
	conversationStore,
	flushPersistence,
	refreshContext,
	restoreLastConversation,
	setModel,
} from './chat'
import { addPageBusyStore, addPageErrorStore, quoteSelection } from './composer'
import { extractPage, initBrowserEvents, readTabInfo, takePendingPageTabs } from './browser'
import { findAttachedPage, nextPageHandle, pagesStore } from './pages'
import { initSettings, settingsStore } from './settings'
import { initMemory, memoryStore } from './memory'
import { refreshPromptStatus } from './prompt'
import { Store } from '../core/store'
import { enabledBuiltInTools, normalizeSettings } from '../core/settings'
import { freezePage } from '../core/context/page-block'
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

/** Capture one tab and append it to the chat on screen. */
export async function addPage(tabId?: number): Promise<void> {
	if (addPageBusyStore.get()) return
	addPageBusyStore.set(true)
	addPageErrorStore.set(null)
	try {
		const info = await readTabInfo(tabId)
		// The document is already in this chat: capturing it again would freeze a second
		// block under a new handle for the same page.
		if (findAttachedPage(info.url)) return

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
 * the selected text alone is still useful.
 */
async function addSelection(text: string, tabId: number): Promise<void> {
	quoteSelection(text)
	await addPage(tabId)
}

/** Add every page the user asked for while the panel was not listening. */
async function drainPendingPages(): Promise<void> {
	const tabIds = await takePendingPageTabs()
	for (const tabId of tabIds) await addPage(tabId)
}

export async function bootstrap(): Promise<void> {
	await initSettings()
	await initMemory()

	// The panel reopens on the chat it was showing. Restoring before the browser events
	// are wired keeps a page add from landing in the chat that is about to be replaced;
	// the worker queues those tabs, so `drainPendingPages` still delivers them.
	try {
		await restoreLastConversation()
	} catch {
		// A failed restore must not cost the panel its event wiring: the next chat still
		// works, it is simply new.
	}

	const settings = settingsStore.get()
	const conversation = conversationStore.get()
	if (!conversation.model && settings.defaultModel) setModel(settings.defaultModel)

	// The worker both queues a tab and broadcasts `page.add`, so both paths drain the same
	// queue: whichever arrives first adds the page, and the other one finds it gone.
	initBrowserEvents({
		onPageAdd: () => void drainPendingPages(),
		onSelection: (text, tabId) => void addSelection(text, tabId),
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

	// A context-menu click that happened before the panel finished loading.
	void drainPendingPages()

	window.addEventListener('pagehide', () => void flushPersistence())
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') void flushPersistence()
	})

	bootStatusStore.set('ready')
}
