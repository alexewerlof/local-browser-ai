/**
 * Prompts the user submitted while the agent was busy.
 *
 * A queue belongs to one conversation and lives in its own IndexedDB store, not on
 * `Conversation`: `runTurn` commits a working copy of the conversation for every token,
 * so a removal made mid-run would be overwritten by the next commit.
 *
 * `queueStore` only ever holds the queue of the conversation that is on screen. Writes
 * are serialized through one chain, and every mutation is persisted *before* it is
 * published: a row the user can see is already durable, so a reload cannot lose it.
 */

import { Store } from '../core/store'
import type { PromptTab, QueuedPrompt } from '../core/types'
import { normalizePromptTab } from '../core/context/prompt-tab'
import { createId, now } from '../core/util'
import { loadQueue, saveQueue } from './database'

export const queueStore = new Store<QueuedPrompt[]>([])

/** Conversation the store currently mirrors. */
let activeConversationId: string | null = null
/** Bumped on every bind/load, so a slow load cannot overwrite a newer one. */
let generation = 0

let chain: Promise<void> = Promise.resolve()

function enqueueWrite(task: () => Promise<void>): Promise<void> {
	chain = chain.then(task).catch(() => undefined)
	return chain
}

/** Await pending writes (used before a conversation swap and on unload). */
export function flushQueuePersistence(): Promise<void> {
	return chain
}

function persist(conversationId: string, items: QueuedPrompt[]): Promise<void> {
	return enqueueWrite(() => saveQueue(conversationId, items))
}

/** Drop anything a corrupted store could contain instead of trusting its shape. */
function normalizeQueue(value: unknown): QueuedPrompt[] {
	if (!Array.isArray(value)) return []
	return value.flatMap((entry): QueuedPrompt[] => {
		if (typeof entry !== 'object' || entry === null) return []
		const item = entry as Partial<QueuedPrompt>
		if (typeof item.id !== 'string' || typeof item.text !== 'string') return []
		const text = item.text.trim()
		if (!text) return []
		const queued: QueuedPrompt = {
			id: item.id,
			text,
			promptTemplateId: typeof item.promptTemplateId === 'string' ? item.promptTemplateId : undefined,
			createdAt: typeof item.createdAt === 'number' ? item.createdAt : now(),
		}
		// The tab was named when the prompt was sent, so it is replayed as it was; only a
		// malformed entry is dropped, and the turn goes without a note rather than a broken one.
		const tab = normalizePromptTab(item.tab)
		if (tab) queued.tab = tab
		return [queued]
	})
}

/** Persist `items` for the conversation, then publish them if it is still on screen. */
async function commitQueue(conversationId: string, items: QueuedPrompt[]): Promise<void> {
	await persist(conversationId, items)
	if (activeConversationId === conversationId) queueStore.set(items)
}

/** Point the store at a conversation whose queue is empty (a brand-new chat). */
export function bindQueue(conversationId: string): void {
	generation += 1
	activeConversationId = conversationId
	queueStore.set([])
}

/** Point the store at a saved conversation and restore its pending prompts. */
export async function loadQueueFor(conversationId: string): Promise<void> {
	const token = (generation += 1)
	activeConversationId = conversationId
	queueStore.set([])

	await chain
	const stored = normalizeQueue(await loadQueue(conversationId))
	if (generation !== token) return

	// A prompt queued while the read was in flight is newer than the stored queue.
	const pending = queueStore.get()
	const merged = [...stored, ...pending.filter((item) => !stored.some((entry) => entry.id === item.id))]
	queueStore.set(merged)
	if (merged.length !== stored.length) await persist(conversationId, merged)
}

/** What a queued prompt keeps from the moment it was submitted. */
export interface QueuedPromptOptions {
	promptTemplateId?: string
	/** The tab on screen at submit: the queue drains later, when it may well be gone. */
	tab?: PromptTab
}

/** Append a prompt to the conversation's queue. Blank prompts are ignored. */
export async function enqueuePrompt(
	conversationId: string,
	text: string,
	options: QueuedPromptOptions = {},
): Promise<QueuedPrompt | null> {
	const content = text.trim()
	if (!content) return null
	if (activeConversationId !== conversationId) return null

	const item: QueuedPrompt = { id: createId('queued'), text: content, createdAt: now() }
	if (options.promptTemplateId) item.promptTemplateId = options.promptTemplateId
	if (options.tab) item.tab = options.tab

	await commitQueue(conversationId, [...queueStore.get(), item])
	return item
}

/** Remove one prompt (the UI puts its text back in the composer) and return it. */
export async function removeQueuedPrompt(conversationId: string, id: string): Promise<QueuedPrompt | null> {
	if (activeConversationId !== conversationId) return null
	const items = queueStore.get()
	const removed = items.find((item) => item.id === id)
	if (!removed) return null

	await commitQueue(
		conversationId,
		items.filter((item) => item.id !== id),
	)
	return removed
}

/**
 * Take the oldest prompt off the queue. The removal is written before the turn starts,
 * so a reload mid-answer cannot replay a prompt that already ran.
 */
export async function takeNextQueuedPrompt(conversationId: string): Promise<QueuedPrompt | null> {
	if (activeConversationId !== conversationId) return null
	const items = queueStore.get()
	const [next, ...rest] = items
	if (!next) return null

	await commitQueue(conversationId, rest)
	return next
}

/** Put a taken prompt back at the front when its turn could not start after all. */
export async function restorePromptFront(conversationId: string, item: QueuedPrompt): Promise<void> {
	const stored = normalizeQueue(await loadQueue(conversationId))
	if (stored.some((entry) => entry.id === item.id)) return

	const next = [item, ...stored]
	await persist(conversationId, next)
	// The panel may have moved to another chat; its store must not gain this prompt.
	if (activeConversationId === conversationId) queueStore.set(next)
}

/** Drop every pending prompt for a conversation. */
export async function clearQueue(conversationId: string): Promise<void> {
	if (activeConversationId === conversationId) queueStore.set([])
	await persist(conversationId, [])
}
