import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ChatMessage, Conversation, PageSnapshot, QueuedPrompt } from '../core/types'
import { freezePage, pageHandle } from '../core/context/page-block'
import { createId, now } from '../core/util'

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
		value: StoredConversation
		indexes: { 'by-updated': number }
	}
	/** Pending prompts, keyed by the conversation they belong to. */
	queues: {
		key: string
		value: QueuedPrompt[]
	}
	/** Page snapshots, keyed by their id. */
	pages: {
		key: string
		value: PageSnapshot
		indexes: { 'by-conversation': string }
	}
}

/**
 * What is on disk. Chats written before pages had their own store still carry the
 * snapshots inline under `attachments`; `adoptLegacyPages` moves them out on load.
 */
type StoredConversation = Conversation & { attachments?: LegacyPage[] }

/** A snapshot as it was stored inline, before it had a conversation, a handle or a block. */
type LegacyPage = Omit<PageSnapshot, 'conversationId' | 'handle' | 'block'>

const DB_NAME = 'local-browser-ai'
const DB_VERSION = 3

let databasePromise: Promise<IDBPDatabase<PanelDatabase>> | null = null
/** Used when IndexedDB is unavailable (private mode, some test environments). */
const memory = new Map<string, Conversation>()
const queueMemory = new Map<string, QueuedPrompt[]>()
const pageMemory = new Map<string, PageSnapshot>()

function database(): Promise<IDBPDatabase<PanelDatabase>> | null {
	if (typeof indexedDB === 'undefined') return null
	if (!databasePromise) {
		databasePromise = openDB<PanelDatabase>(DB_NAME, DB_VERSION, {
			upgrade(db, oldVersion) {
				if (oldVersion < 1) {
					const store = db.createObjectStore('conversations', { keyPath: 'id' })
					store.createIndex('by-updated', 'updatedAt')
				}
				// Each step is guarded by its own version, never by the newest one: a database
				// created at v3 still has to be born with the stores added in v1 and v2.
				if (oldVersion < 2) db.createObjectStore('queues')
				if (oldVersion < 3) {
					const pages = db.createObjectStore('pages', { keyPath: 'id' })
					pages.createIndex('by-conversation', 'conversationId')
				}
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
	if (!db) {
		const adopted = adoptLegacyPages(memory.get(id) ?? null)
		if (adopted?.migrated) {
			for (const page of adopted.pages) pageMemory.set(page.id, page)
			memory.set(id, adopted.conversation)
		}
		return reviveStored(adopted?.conversation ?? null)
	}
	try {
		const handle = await db
		const stored = await handle.get('conversations', id)
		const adopted = adoptLegacyPages(stored ?? null)
		if (adopted?.migrated) {
			for (const page of adopted.pages) await savePage(page)
			await saveConversation(adopted.conversation)
		}
		return reviveStored(adopted?.conversation ?? null)
	} catch {
		return null
	}
}

interface AdoptedConversation {
	conversation: Conversation
	/** Pages rewritten into their own records; empty when nothing was stored inline. */
	pages: PageSnapshot[]
	migrated: boolean
}

/**
 * Chats saved before pages had their own store keep the snapshot inline under
 * `attachments`, with no handle and no frozen block. Rewriting it once here means the
 * rest of the app only ever sees page records.
 */
function adoptLegacyPages(stored: StoredConversation | null): AdoptedConversation | null {
	if (!stored) return null
	const { attachments, ...rest } = stored
	if (!attachments || attachments.length === 0) {
		return { conversation: rest, pages: [], migrated: false }
	}

	const pages = attachments.map((page, index) => freezePage(page, rest.id, pageHandle(index)))
	const refs = pages.map((page) => ({ type: 'page-ref' as const, pageId: page.id }))
	const messages: ChatMessage[] = [...rest.messages]
	// The page block belongs to the turn it was added to; the newest user message is the
	// only safe guess once the original insertion point is gone.
	let target = messages.reduce((found, message, index) => (message.role === 'user' ? index : found), -1)
	if (target === -1) {
		messages.push({ id: createId('msg'), role: 'user', parts: refs, createdAt: now(), status: 'complete' })
		target = messages.length - 1
	} else {
		const existing = messages[target]
		if (existing) messages[target] = { ...existing, parts: [...refs, ...existing.parts] }
	}

	const messageId = messages[target]?.id ?? ''
	const claimed = pages.map((page) => ({ ...page, messageId }))
	return {
		conversation: { ...rest, messages },
		pages: claimed,
		migrated: true,
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
	if (db) {
		try {
			const handle = await db
			await handle.delete('conversations', id)
			await handle.delete('queues', id)
		} catch {
			// ignore
		}
	}
	await deletePages(await pageIdsOf(id))
}

export async function clearConversations(): Promise<void> {
	memory.clear()
	queueMemory.clear()
	pageMemory.clear()
	const db = database()
	if (!db) return
	try {
		const handle = await db
		await handle.clear('conversations')
		await handle.clear('queues')
		await handle.clear('pages')
	} catch {
		// ignore
	}
}

/* -------------------------------------------------------------------- pages */

/** Load the pages of one conversation, oldest first. */
export async function loadPages(conversationId: string): Promise<PageSnapshot[]> {
	const db = database()
	if (!db) {
		return [...pageMemory.values()]
			.filter((page) => page.conversationId === conversationId)
			.sort((a, b) => a.capturedAt - b.capturedAt)
	}
	try {
		const handle = await db
		const pages = await handle.getAllFromIndex('pages', 'by-conversation', conversationId)
		return pages.sort((a, b) => a.capturedAt - b.capturedAt)
	} catch {
		return []
	}
}

export async function savePage(page: PageSnapshot): Promise<void> {
	pageMemory.set(page.id, page)
	const db = database()
	if (!db) return
	try {
		const handle = await db
		await handle.put('pages', page)
	} catch {
		// A full or unavailable database must not break the chat.
	}
}

export async function deletePages(ids: string[]): Promise<void> {
	for (const id of ids) pageMemory.delete(id)
	const db = database()
	if (!db || ids.length === 0) return
	try {
		const handle = await db
		await Promise.all(ids.map((id) => handle.delete('pages', id)))
	} catch {
		// ignore
	}
}

/** Ids of every page a conversation owns, so deleting the chat can clean up. */
async function pageIdsOf(conversationId: string): Promise<string[]> {
	const db = database()
	if (!db) {
		return [...pageMemory.values()].filter((page) => page.conversationId === conversationId).map((page) => page.id)
	}
	try {
		const handle = await db
		return await handle.getAllKeysFromIndex('pages', 'by-conversation', conversationId)
	} catch {
		return []
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
