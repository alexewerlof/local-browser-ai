import {
	refreshContext,
	conversationStore,
	flushPersistence,
	setAttachment,
	markAttachmentStale,
	setModel,
} from './chat'
import { attachBusyStore, attachErrorStore, quoteSelection } from './composer'
import { claimClickedTab, extractFromTab, initBrowserEvents, clearTab, tabIdStore } from './browser'
import { initSettings, settingsStore } from './settings'
import { initMemory, memoryStore } from './memory'
import { refreshPromptStatus } from './prompt'
import { toAppError } from '../providers/errors'

/** Attach the tab the user invoked the extension on, or the active tab. */
export async function attachTab(tabId?: number): Promise<void> {
	if (attachBusyStore.get()) return
	attachBusyStore.set(true)
	attachErrorStore.set(null)
	try {
		if (tabId !== undefined) {
			const result = await extractFromTab(tabId)
			setAttachment(result.attachment)
			return
		}

		const claimed = await claimClickedTab()
		if (claimed) {
			setAttachment(claimed.attachment)
			return
		}

		// No pending click. Try the active tab: this works when the extension already has
		// access to it (an earlier toolbar click, or a localhost/host grant).
		const result = await extractFromTab()
		setAttachment(result.attachment)
	} catch (error) {
		attachErrorStore.set(toAppError(error).message)
	} finally {
		attachBusyStore.set(false)
	}
}

/** Re-read the page behind the current attachment. */
export async function refreshAttachment(): Promise<void> {
	const tabId = tabIdStore.get()
	if (tabId === null) {
		await attachTab()
		return
	}
	await attachTab(tabId)
}

/** Attach the tab the user just clicked the extension icon on. */
export async function attachClickedTab(): Promise<void> {
	await attachTab()
}

export function detachAttachment(): void {
	setAttachment(null)
	clearTab()
	attachErrorStore.set(null)
}

export async function bootstrap(): Promise<void> {
	await initSettings()
	await initMemory()

	const settings = settingsStore.get()
	const conversation = conversationStore.get()
	if (!conversation.model && settings.defaultModel) setModel(settings.defaultModel)

	initBrowserEvents({
		onAttachRequested: () => void attachTab(),
		onSelection: (text) => quoteSelection(text),
		onTabChanged: () => {
			markAttachmentStale()
		},
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

	refreshContext()

	const activeModel = conversationStore.get().model
	if (activeModel?.providerId === 'prompt-api') void refreshPromptStatus()

	// A toolbar or context-menu click that happened before the panel finished loading.
	void (async () => {
		try {
			const claimed = await claimClickedTab()
			if (claimed) setAttachment(claimed.attachment)
		} catch {
			// No pending tab: the panel opened on its own.
		}
	})()

	window.addEventListener('pagehide', () => void flushPersistence())
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') void flushPersistence()
	})
}
