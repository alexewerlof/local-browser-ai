import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Conversation } from '../core/types'

export interface ConversationMeta {
	id: string
	title: string
	createdAt: number
	updatedAt: number
	/** When the newest message in the conversation was created; drives the history order. */
	lastMessageAt: number
	messageCount: number
	modelLabel: string
}

interface PanelDatabase extends DBSchema {
	conversations: {
		key: string
		value: Conversation
		indexes: { 'by-updated': number }
	}
}

const DB_NAME = 'local-browser-ai'
const DB_VERSION = 1

let databasePromise: Promise<IDBPDatabase<PanelDatabase>> | null = null
/** Used when IndexedDB is unavailable (private mode, some test environments). */
const memory = new Map<string, Conversation>()

function database(): Promise<IDBPDatabase<PanelDatabase>> | null {
	if (typeof indexedDB === 'undefined') return null
	if (!databasePromise) {
		databasePromise = openDB<PanelDatabase>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				const store = db.createObjectStore('conversations', { keyPath: 'id' })
				store.createIndex('by-updated', 'updatedAt')
			},
		})
	}
	return databasePromise
}

export async function listConversations(): Promise<ConversationMeta[]> {
	const db = database()
	if (!db) return historyEntries([...memory.values()])
	try {
		const handle = await db
		return historyEntries(await handle.getAllFromIndex('conversations', 'by-updated'))
	} catch {
		return []
	}
}

/**
 * What the history drawer shows: chats that hold messages, newest message first. Empty
 * drafts stay out of the list (the open chat is still reachable by staying put), and a
 * pure model change must not reorder the history.
 */
function historyEntries(conversations: Conversation[]): ConversationMeta[] {
	return conversations
		.filter((conversation) => conversation.messages.length > 0)
		.map(toMeta)
		.sort((a, b) => b.lastMessageAt - a.lastMessageAt)
}

export async function loadConversation(id: string): Promise<Conversation | null> {
	const db = database()
	if (!db) return memory.get(id) ?? null
	try {
		const handle = await db
		return (await handle.get('conversations', id)) ?? null
	} catch {
		return null
	}
}

export async function saveConversation(conversation: Conversation): Promise<void> {
	memory.set(conversation.id, conversation)
	const db = database()
	if (!db) return
	try {
		const handle = await db
		await handle.put('conversations', conversation)
	} catch {
		// A full or unavailable database must not break the chat.
	}
}

export async function deleteConversation(id: string): Promise<void> {
	memory.delete(id)
	const db = database()
	if (!db) return
	try {
		const handle = await db
		await handle.delete('conversations', id)
	} catch {
		// ignore
	}
}

export async function clearConversations(): Promise<void> {
	memory.clear()
	const db = database()
	if (!db) return
	try {
		const handle = await db
		await handle.clear('conversations')
	} catch {
		// ignore
	}
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
	if (!navigator.storage?.estimate) return null
	try {
		const estimate = await navigator.storage.estimate()
		return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
	} catch {
		return null
	}
}

function toMeta(conversation: Conversation): ConversationMeta {
	const lastMessageAt = conversation.messages.reduce((latest, message) => Math.max(latest, message.createdAt), 0)
	return {
		id: conversation.id,
		title: conversation.title,
		createdAt: conversation.createdAt,
		updatedAt: conversation.updatedAt,
		lastMessageAt: lastMessageAt || conversation.updatedAt,
		messageCount: conversation.messages.length,
		modelLabel: conversation.model ? `${conversation.model.providerId}:${conversation.model.modelId}` : '',
	}
}
