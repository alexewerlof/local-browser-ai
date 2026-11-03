/**
 * Memory persistence and mutation.
 *
 * Memory is its own storage key rather than a settings subtree: settings are rewritten
 * on a 250 ms debounce on every keystroke, and memory needs discrete, awaited writes so
 * a failed save is reported to the model instead of silently disappearing.
 *
 * Writes are serialized through one chain, so two tool calls in the same turn cannot
 * read the same document and lose each other's changes.
 */

import { Store } from '../core/store'
import { createStore, STORAGE_KEYS } from '../platform/storage'
import {
	applyMemoryUpdate,
	createMemoryItem,
	emptyMemoryDocument,
	exportMemories,
	findDuplicateMemory,
	liveMemories,
	MEMORY_MAX_ITEMS,
	mergeMemoryDocuments,
	normalizeMemoryDocument,
	normalizeMemoryText,
	purgeTombstones,
	sortMemoryItems,
	type MemoryAccess,
	type MemoryImport,
	type MemorySaveInput,
	type MemorySaveResult,
	type MemoryUpdatePatch,
} from '../core/memory'
import type { MemoryDocument, MemoryExport, MemoryItem, MemoryMode } from '../core/types'

const storage = createStore()

export const memoryStore = new Store<MemoryDocument>(emptyMemoryDocument())
export const memoryStatusStore = new Store<'loading' | 'ready'>('loading')

/**
 * `null` means "nothing changed, do not write". Returning a document persists it and
 * publishes it to the store.
 */
type MemoryMutation = (current: MemoryDocument) => MemoryDocument | null

let chain: Promise<boolean> = Promise.resolve(true)

function enqueue(update: MemoryMutation): Promise<boolean> {
	const run = chain.then(async () => {
		const next = update(memoryStore.get())
		if (!next) return true
		try {
			await storage.set(STORAGE_KEYS.memory, next)
			memoryStore.set(next)
			return true
		} catch {
			// A full or unavailable store must not corrupt the in-memory view.
			return false
		}
	})
	chain = run.catch(() => false)
	return run
}

let initialized = false

/** Load once and keep the store in sync with writes from the options page. */
export async function initMemory(): Promise<void> {
	if (initialized) return
	initialized = true

	let stored: unknown = null
	try {
		stored = await storage.get<unknown>(STORAGE_KEYS.memory, null)
	} catch {
		// An unreadable store must not keep the panel from loading; memory starts empty
		// and the next write replaces the unreadable document.
	}
	const document = normalizeMemoryDocument(stored, Date.now())
	const items = purgeTombstones(document.items)
	const current: MemoryDocument = items.length === document.items.length ? document : { ...document, items }
	memoryStore.set(current)
	// Tombstones past the retention window are dropped, so the document does not grow forever.
	if (items.length !== document.items.length) void enqueue(() => current)

	memoryStatusStore.set('ready')

	storage.watch(STORAGE_KEYS.memory, (value) => {
		memoryStore.set(normalizeMemoryDocument(value, Date.now()))
	})
}

/** Live items only: the model and the injector never see tombstones. */
export const memoryAccess: MemoryAccess = {
	list: () => liveMemories(memoryStore.get().items),
	save: (input) => saveMemory(input),
}

/**
 * Create or update a memory.
 *
 * Without an `id` the text is deduplicated against the live set, so the model calling
 * `remember` twice with the same fact reports `unchanged` instead of piling up copies.
 */
export async function saveMemory(input: MemorySaveInput): Promise<MemorySaveResult> {
	let result: MemorySaveResult = { ok: false, error: 'The memory could not be saved.' }

	const written = await enqueue((current) => {
		const text = normalizeMemoryText(input.text)
		if (!text) {
			result = { ok: false, error: 'A memory needs some text.' }
			return null
		}

		const now = Date.now()

		if (input.id) {
			const existing = current.items.find((item) => item.id === input.id)
			if (!existing || existing.deletedAt) {
				result = {
					ok: false,
					error: `No memory with id "${input.id}". Create one by calling remember without an id.`,
				}
				return null
			}
			const next = applyMemoryUpdate(existing, { title: input.title, text, mode: input.mode }, now)
			if (next.updatedAt === existing.updatedAt) {
				result = { ok: true, item: existing, action: 'unchanged' }
				return null
			}
			result = { ok: true, item: next, action: 'updated' }
			return {
				...current,
				items: sortMemoryItems(current.items.map((item) => (item.id === next.id ? next : item))),
			}
		}

		const duplicate = findDuplicateMemory(current.items, text)
		if (duplicate) {
			result = { ok: true, item: duplicate, action: 'unchanged' }
			return null
		}

		if (liveMemories(current.items).length >= MEMORY_MAX_ITEMS) {
			result = {
				ok: false,
				error: `Memory is full (${MEMORY_MAX_ITEMS} items). Delete something in Settings first.`,
			}
			return null
		}

		const created = createMemoryItem({ ...input, text, now })
		result = { ok: true, item: created, action: 'created' }
		return { ...current, items: sortMemoryItems([created, ...current.items]) }
	})

	if (!written && result.ok) return { ok: false, error: 'The memory could not be written to storage.' }
	return result
}

/** Edit an item from the Settings editor. */
export function updateMemory(id: string, patch: MemoryUpdatePatch): Promise<boolean> {
	return enqueue((current) => {
		const existing = current.items.find((item) => item.id === id)
		if (!existing || existing.deletedAt) return null

		const text = patch.text === undefined ? existing.text : normalizeMemoryText(patch.text)
		if (!text) return null

		const next = applyMemoryUpdate(existing, { ...patch, text })
		if (next.updatedAt === existing.updatedAt) return null

		return {
			...current,
			items: sortMemoryItems(current.items.map((item) => (item.id === id ? next : item))),
		}
	})
}

export function setMemoryMode(id: string, mode: MemoryMode): Promise<boolean> {
	return updateMemory(id, { mode })
}

/**
 * Delete by tombstone. The record stays for the retention window so a future sync
 * backend propagates the deletion instead of resurrecting the item, and so undo works.
 */
export function deleteMemory(id: string): Promise<boolean> {
	return enqueue((current) => {
		const existing = current.items.find((item) => item.id === id)
		if (!existing || existing.deletedAt) return null
		const now = Date.now()
		const next: MemoryItem = { ...existing, deletedAt: now, updatedAt: now }
		return {
			...current,
			items: sortMemoryItems(current.items.map((item) => (item.id === id ? next : item))),
		}
	})
}

export function restoreMemory(id: string): Promise<boolean> {
	return enqueue((current) => {
		const existing = current.items.find((item) => item.id === id)
		if (!existing?.deletedAt) return null
		const { deletedAt: _deletedAt, ...rest } = existing
		const next: MemoryItem = { ...rest, updatedAt: Date.now() }
		return {
			...current,
			items: sortMemoryItems(current.items.map((item) => (item.id === id ? next : item))),
		}
	})
}

export function clearMemories(): Promise<boolean> {
	return enqueue((current) => (current.items.length === 0 ? null : { ...current, items: [] }))
}

export function exportMemoryDocument(): MemoryExport {
	return exportMemories(memoryStore.get())
}

export interface MemoryImportReport {
	ok: boolean
	added: number
	updated: number
	skipped: number
}

export async function importMemoryItems(imported: MemoryImport): Promise<MemoryImportReport> {
	let report: MemoryImportReport = { ok: false, added: 0, updated: 0, skipped: imported.skipped }

	const written = await enqueue((current) => {
		const merged = mergeMemoryDocuments(current.items, imported.items)
		report = {
			ok: true,
			added: merged.added,
			updated: merged.updated,
			skipped: merged.skipped + imported.skipped,
		}
		if (merged.added === 0 && merged.updated === 0) return null
		return { ...current, items: merged.items }
	})

	return written ? report : { ...report, ok: false }
}
