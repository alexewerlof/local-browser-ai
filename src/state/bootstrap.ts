import { appendPage, conversationStore, flushPersistence, refreshContext, setModel } from './chat'
import { addPageBusyStore, addPageErrorStore, quoteSelection } from './composer'
import { extractPage, initBrowserEvents, takePendingPageTabs } from './browser'
import { bindPages, nextPageHandle, pagesStore } from './pages'
import { initSettings, settingsStore } from './settings'
import { initMemory, memoryStore } from './memory'
import { refreshPromptStatus } from './prompt'
import { enabledBuiltInTools, normalizeSettings } from '../core/settings'
import { freezePage } from '../core/context/page-block'
import { hasPageTools } from '../browser/tools'
import { getModelInfo } from '../providers/catalog'
import { toAppError } from '../providers/errors'

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
		const readable = pageReadable()
		if (!readable.ok) {
			addPageErrorStore.set(readable.message)
			return
		}

		const { page, info } = await extractPage(tabId)
		const conversation = conversationStore.get()
		const snapshot = freezePage({ ...page, tabIdHint: info.id }, conversation.id, nextPageHandle(pagesStore.get()))
		await appendPage(snapshot)
	} catch (error) {
		addPageErrorStore.set(toAppError(error).message)
	} finally {
		addPageBusyStore.set(false)
	}
}

/** Add every page the user asked for while the panel was not listening. */
async function drainPendingPages(): Promise<void> {
	const tabIds = await takePendingPageTabs()
	for (const tabId of tabIds) await addPage(tabId)
}

export async function bootstrap(): Promise<void> {
	await initSettings()
	await initMemory()

	const settings = settingsStore.get()
	const conversation = conversationStore.get()
	if (!conversation.model && settings.defaultModel) setModel(settings.defaultModel)

	initBrowserEvents({
		onPageAdd: (tabId) => void addPage(tabId),
		onSelection: (text) => quoteSelection(text),
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

	// A fresh panel always opens a new chat, which owns no pages.
	bindPages([])
	refreshContext()

	const activeModel = conversationStore.get().model
	if (activeModel?.providerId === 'prompt-api') void refreshPromptStatus()

	// A context-menu click that happened before the panel finished loading.
	void drainPendingPages()

	window.addEventListener('pagehide', () => void flushPersistence())
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') void flushPersistence()
	})
}
