/**
 * Small pieces of panel state that outlive the panel itself.
 *
 * The side panel is torn down whenever it is closed, so anything a reopened panel must
 * know has to be written down. Only the open chat lives here today: the transcript and
 * its pages are in IndexedDB, but which chat was on screen is not part of any chat.
 *
 * Kept beside settings rather than inside them: settings are rewritten on a 250 ms
 * debounce on every keystroke, and this is a single value written only when it changes.
 */

import { createStore, STORAGE_KEYS } from '../platform/storage'

const storage = createStore()

interface PanelState {
	/** The chat the panel was showing. `null` means it was showing a chat never saved. */
	conversationId: string | null
}

function normalize(value: unknown): PanelState {
	if (typeof value !== 'object' || value === null) return { conversationId: null }
	const id = (value as { conversationId?: unknown }).conversationId
	return { conversationId: typeof id === 'string' && id ? id : null }
}

/** The chat the panel was showing the last time it closed. */
export async function readOpenChatId(): Promise<string | null> {
	try {
		return normalize(await storage.get<unknown>(STORAGE_KEYS.uiState, null)).conversationId
	} catch {
		return null
	}
}

/**
 * Remember the chat on screen. A failed write is not worth surfacing: the panel works,
 * it just opens on a new chat next time.
 */
export async function writeOpenChatId(conversationId: string): Promise<void> {
	try {
		await storage.set(STORAGE_KEYS.uiState, { conversationId } satisfies PanelState)
	} catch {
		// Storage full, unavailable or in private mode.
	}
}

/** Forget the remembered chat: it was deleted, so there is nothing left to reopen. */
export async function clearOpenChatId(): Promise<void> {
	try {
		await storage.remove(STORAGE_KEYS.uiState)
	} catch {
		// ignore
	}
}
