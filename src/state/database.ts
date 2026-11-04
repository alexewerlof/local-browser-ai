import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Conversation, QueuedPrompt } from '../core/types'

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
	/** Pending prompts, keyed by the conversation they belong to. */
	queues: {
		key: string
		value: QueuedPrompt[]
	}
}

const DB_NAME = 'local-browser-ai'
const DB_VERSION = 2

let databasePromise: Promise<IDBPDatabase<PanelDatabase>> | null = null
/** Used when IndexedDB is unavailable (private mode, some test environments). */
const memory = new Map<string, Conversation>()
const queueMemory = new Map<string, QueuedPrompt[]>()

function database(): Promise<IDBPDatabase<PanelDatabase>> | null {
	if (typeof indexedDB === 'undefined') return null
	if (!databasePromise) {
		databasePromise = openDB<PanelDatabase>(DB_NAME, DB_VERSION, {
			upgrade(db, oldVersion) {
				if (oldVersion < 1) {
					const store = db.createObjectStore('conversations', { keyPath: 'id' })
					store.createIndex('by-updated', 'updatedAt')
				}
				if (oldVersion < 2) db.createObjectStore('queues')
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
	if (!db) return reviveStored(memory.get(id) ?? null)
	try {
		const handle = await db
		return reviveStored((await handle.get('conversations', id)) ?? null)
	} catch {
		return null
	}
}

/**
 * A message saved while it was streaming cannot still be streaming: the panel that
 * produced it is gone. Marking it `aborted` stops a reopened chat from showing a
 * typing indicator forever.
 */
function reviveStored(conversation: Conversation | null): Conversation | null {
	if (!conversation) return null
	if (!conversation.messages.some((message) => message.status === 'streaming')) return conversation
	return {
		...conversation,
		messages: conversation.messages.map((message) =>
			message.status === 'streaming' ? { ...message, status: 'aborted' } : message,
		),
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
	queueMemory.delete(id)
	const db = database()
	if (!db) return
	try {
		const handle = await db
		await handle.delete('conversations', id)
		await handle.delete('queues', id)
	} catch {
		// ignore
	}
}

export async function clearConversations(): Promise<void> {
	memory.clear()
	queueMemory.clear()
	const db = database()
	if (!db) return
	try {
		const handle = await db
		await handle.clear('conversations')
		await handle.clear('queues')
	} catch {
		// ignore
	}
}

/* ------------------------------------------------------------------ queues */

/** Pending prompts for one conversation; empty when nothing is queued. */
export async function loadQueue(conversationId: string): Promise<QueuedPrompt[]> {
	const db = database()
	if (!db) return queueMemory.get(conversationId) ?? []
	try {
		const handle = await db
		return (await handle.get('queues', conversationId)) ?? []
	} catch {
		return []
	}
}

export async function saveQueue(conversationId: string, items: QueuedPrompt[]): Promise<void> {
	if (items.length === 0) {
		await deleteQueue(conversationId)
		return
	}
	queueMemory.set(conversationId, items)
	const db = database()
	if (!db) return
	try {
		const handle = await db
		await handle.put('queues', items, conversationId)
	} catch {
		// A full or unavailable database must not break the chat.
	}
}

export async function deleteQueue(conversationId: string): Promise<void> {
	queueMemory.delete(conversationId)
	const db = database()
	if (!db) return
	try {
		const handle = await db
		await handle.delete('queues', conversationId)
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
