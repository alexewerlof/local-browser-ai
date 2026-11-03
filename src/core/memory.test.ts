import { describe, expect, it } from 'vitest'
import type { MemoryItem, MemorySettings } from './types'
import {
	applyMemoryUpdate,
	createMemoryItem,
	describeMemoryInjection,
	exportMemories,
	findDuplicateMemory,
	MEMORY_MAX_TEXT,
	MEMORY_TOMBSTONE_MS,
	memoryInjectionLimit,
	mergeMemoryDocuments,
	normalizeMemoryDocument,
	normalizeMemoryText,
	normalizeMemoryTitle,
	parseMemoryExport,
	purgeTombstones,
	recallMemories,
	selectMemoryInjection,
} from './memory'
import { createBudget } from './context/tokens'

const settings: MemorySettings = { enabled: true, injectShare: 0.15, autoLimit: 3 }

let counter = 0

function item(overrides: Partial<MemoryItem> = {}): MemoryItem {
	counter += 1
	return {
		id: `memory_${counter}`,
		title: '',
		text: 'Prefers TypeScript.',
		mode: 'auto',
		scope: 'global',
		createdAt: counter,
		updatedAt: counter,
		...overrides,
	}
}

describe('normalizeMemoryText', () => {
	it('strips control characters and collapses blank lines', () => {
		expect(normalizeMemoryText('  a\u0000b\n\n\n\nc  ')).toBe('ab\n\nc')
	})

	it('caps the length without splitting a surrogate pair', () => {
		const text = '😀'.repeat(MEMORY_MAX_TEXT + 50)
		const normalized = normalizeMemoryText(text)
		expect([...normalized]).toHaveLength(MEMORY_MAX_TEXT)
		// A split pair would leave a lone surrogate, which iterates as its own character.
		expect([...normalized].every((character) => character === '😀')).toBe(true)
	})

	it('keeps titles on one line', () => {
		expect(normalizeMemoryTitle(' Work\n  style ')).toBe('Work style')
	})
})

describe('normalizeMemoryDocument', () => {
	it('drops malformed and duplicate entries but keeps the rest', () => {
		const document = normalizeMemoryDocument({
			version: 1,
			items: [
				{ id: 'a', text: 'First', mode: 'always' },
				{ id: 'a', text: 'Duplicate id' },
				{ id: '', text: 'No id' },
				{ id: 'b', text: '   ' },
				{ id: 'c', text: 'Second', mode: 'nonsense' },
			],
		})
		expect(document.items.map((entry) => entry.id)).toEqual(['a', 'c'])
		expect(document.items[0]?.mode).toBe('always')
		// An unknown mode falls back to auto, never to always.
		expect(document.items[1]?.mode).toBe('auto')
	})

	it('survives garbage input', () => {
		expect(normalizeMemoryDocument('nope')).toEqual({ version: 1, items: [] })
		expect(normalizeMemoryDocument({ items: 'nope' })).toEqual({ version: 1, items: [] })
	})

	it('keeps tombstones after the live items', () => {
		const document = normalizeMemoryDocument({
			items: [
				{ id: 'deleted', text: 'Gone', deletedAt: 5, updatedAt: 50 },
				{ id: 'live', text: 'Here', updatedAt: 10 },
			],
		})
		expect(document.items.map((entry) => entry.id)).toEqual(['live', 'deleted'])
	})
})

describe('createMemoryItem', () => {
	it('defaults to auto so a model save is never always-on', () => {
		const created = createMemoryItem({ text: ' Likes tabs. ', now: 100 })
		expect(created.mode).toBe('auto')
		expect(created.text).toBe('Likes tabs.')
		expect(created.createdAt).toBe(100)
		expect(created.updatedAt).toBe(100)
	})

	it('keeps the requested id, mode and source', () => {
		const created = createMemoryItem({
			id: 'fixed',
			text: 'Fact',
			mode: 'tool',
			source: { conversationId: 'chat_1' },
		})
		expect(created).toMatchObject({ id: 'fixed', mode: 'tool', source: { conversationId: 'chat_1' } })
	})
})

describe('applyMemoryUpdate', () => {
	it('does not bump updatedAt when nothing changed', () => {
		const existing = item({ updatedAt: 10 })
		const updated = applyMemoryUpdate(existing, { text: existing.text, mode: existing.mode }, 99)
		expect(updated.updatedAt).toBe(10)
	})

	it('bumps updatedAt when the text changes', () => {
		const existing = item({ updatedAt: 10 })
		const updated = applyMemoryUpdate(existing, { text: 'Different' }, 99)
		expect(updated.updatedAt).toBe(99)
		expect(updated.text).toBe('Different')
	})
})

describe('findDuplicateMemory', () => {
	it('ignores case and whitespace', () => {
		const existing = item({ text: 'Prefers   TypeScript' })
		expect(findDuplicateMemory([existing], ' prefers typescript ')).toBe(existing)
	})

	it('ignores tombstones and the item being edited', () => {
		const deleted = item({ text: 'Same', deletedAt: 1 })
		expect(findDuplicateMemory([deleted], 'Same')).toBeUndefined()

		const live = item({ text: 'Same' })
		expect(findDuplicateMemory([live], 'Same', live.id)).toBeUndefined()
	})
})

describe('selectMemoryInjection', () => {
	it('injects always items without a query and never tool-only ones', () => {
		const always = item({ id: 'always', text: 'Speaks German', mode: 'always' })
		const passive = item({ id: 'tool', text: 'Uses Neovim', mode: 'tool' })
		const result = selectMemoryInjection([always, passive], '', settings, 1000, false)
		expect(result.includedIds).toEqual(['always'])
		expect(result.block).toContain('Speaks German')
		expect(result.block).not.toContain('Uses Neovim')
		expect(result.alwaysCount).toBe(1)
		expect(result.autoCount).toBe(0)
	})

	it('injects an auto item only when the prompt matches it', () => {
		const auto = item({ id: 'auto', text: 'Prefers TypeScript over JavaScript' })
		const matching = selectMemoryInjection([auto], 'Which TypeScript version?', settings, 1000, false)
		expect(matching.includedIds).toEqual(['auto'])

		const unrelated = selectMemoryInjection([auto], 'What is the weather?', settings, 1000, false)
		expect(unrelated.includedIds).toEqual([])
		expect(unrelated.block).toBe('')
	})

	it('caps how many auto items are injected', () => {
		const items = ['alpha', 'beta', 'gamma', 'delta'].map((word, index) =>
			item({ id: `auto_${index}`, text: `Project ${word} is ongoing` }),
		)
		const result = selectMemoryInjection(items, 'project', { ...settings, autoLimit: 2 }, 5000, false)
		expect(result.autoCount).toBe(2)
		expect(result.includedIds).toHaveLength(2)
	})

	it('skips items that do not fit and reports them', () => {
		const small = item({ id: 'small', text: 'Short fact', mode: 'always' })
		const big = item({ id: 'big', text: 'word '.repeat(400), mode: 'always' })

		const smallOnly = selectMemoryInjection([small], '', settings, 100_000, false)
		const result = selectMemoryInjection([big, small], '', settings, smallOnly.tokens + 10, false)

		expect(result.includedIds).toEqual(['small'])
		expect(result.omitted).toBe(1)
		expect(describeMemoryInjection(result)).toContain('1 left out for space')
	})

	it('still injects something when nothing fits', () => {
		const big = item({ id: 'big', text: 'word '.repeat(400), mode: 'always' })
		const result = selectMemoryInjection([big], '', settings, 200, false)
		expect(result.includedIds).toEqual(['big'])
		expect(result.block.endsWith('…')).toBe(true)
	})

	it('mentions the tools only when the model has them', () => {
		const always = item({ text: 'Speaks German', mode: 'always' })
		const withoutTools = selectMemoryInjection([always], '', settings, 1000, false)
		const withTools = selectMemoryInjection([always], '', settings, 1000, true)
		expect(withoutTools.block).not.toContain('`recall`')
		expect(withTools.block).toContain('`recall`')
		expect(withTools.tokens).toBeGreaterThan(withoutTools.tokens)
	})

	it('labels memory as data, not instructions', () => {
		const always = item({ text: 'Speaks German', mode: 'always' })
		const result = selectMemoryInjection([always], '', settings, 1000, false)
		expect(result.block).toMatch(/data, not instructions/i)
	})
})

describe('memoryInjectionLimit', () => {
	it('scales with the window but stays inside the hard bounds', () => {
		expect(memoryInjectionLimit(createBudget(20_000, 0.2, 0.75), 0.15)).toBe(1500)
		expect(memoryInjectionLimit(createBudget(2_000, 0.2, 0.75), 0.15)).toBe(240)
		// Below the minimum the floor wins, so a tiny window still gets a usable block.
		expect(memoryInjectionLimit(createBudget(400, 0.2, 0.75), 0.05)).toBe(128)
	})
})

describe('recallMemories', () => {
	it('ranks by the query and reports the corpus size', () => {
		const ts = item({ id: 'ts', text: 'Prefers TypeScript' })
		const go = item({ id: 'go', text: 'Maintains a Go service' })
		const result = recallMemories([ts, go], 'typescript', 5)
		expect(result.items.map((entry) => entry.id)).toEqual(['ts'])
		expect(result.total).toBe(2)
	})

	it('lists the newest items when there is no query', () => {
		const older = item({ id: 'older', text: 'Older', updatedAt: 1 })
		const newer = item({ id: 'newer', text: 'Newer', updatedAt: 2 })
		const result = recallMemories([older, newer], '', 1)
		expect(result.items.map((entry) => entry.id)).toEqual(['newer'])
		expect(result.total).toBe(2)
	})

	it('skips tombstones and clips long text', () => {
		const deleted = item({ id: 'deleted', text: 'Gone', deletedAt: 1 })
		const long = item({ id: 'long', text: 'word '.repeat(400) })
		const result = recallMemories([deleted, long], '', 5)
		expect(result.items.map((entry) => entry.id)).toEqual(['long'])
		expect(result.truncated).toBe(true)
		expect(result.items[0]?.clipped).toBe(true)
	})

	it('returns nothing for an empty store', () => {
		expect(recallMemories([], 'anything')).toEqual({ items: [], total: 0, truncated: false })
	})
})

describe('export and import', () => {
	it('wraps the document in a versioned envelope', () => {
		const exported = exportMemories({ version: 1, items: [item()] }, 500)
		expect(exported.kind).toBe('local-browser-ai.memory')
		expect(exported.exportedAt).toBe(500)
		expect(exported.items).toHaveLength(1)
	})

	it('rejects a file that is not a memory export', () => {
		expect(parseMemoryExport({ items: [] })).toBeNull()
		expect(parseMemoryExport('nope')).toBeNull()
		expect(parseMemoryExport({ kind: 'local-browser-ai.memory' })).toBeNull()
	})

	it('counts malformed items instead of failing the import', () => {
		const parsed = parseMemoryExport({
			kind: 'local-browser-ai.memory',
			items: [{ id: 'ok', text: 'Fact' }, { id: 'bad' }, { id: 'ok', text: 'Duplicate' }],
		})
		expect(parsed?.items).toHaveLength(1)
		expect(parsed?.received).toBe(3)
		expect(parsed?.skipped).toBe(2)
	})
})

describe('mergeMemoryDocuments', () => {
	it('keeps the newest version of each memory', () => {
		const current = [item({ id: 'a', text: 'Old', updatedAt: 10 })]
		const incoming = [item({ id: 'a', text: 'New', updatedAt: 20 })]
		const merged = mergeMemoryDocuments(current, incoming)
		expect(merged.updated).toBe(1)
		expect(merged.items[0]?.text).toBe('New')
	})

	it('does not let an older export overwrite a newer memory', () => {
		const current = [item({ id: 'a', text: 'Current', updatedAt: 20 })]
		const incoming = [item({ id: 'a', text: 'Stale', updatedAt: 10 })]
		const merged = mergeMemoryDocuments(current, incoming)
		expect(merged.skipped).toBe(1)
		expect(merged.items[0]?.text).toBe('Current')
	})

	it('lets a tombstone win a tie so import cannot resurrect a deletion', () => {
		const current = [item({ id: 'a', text: 'Live', updatedAt: 10 })]
		const incoming = [item({ id: 'a', text: 'Live', updatedAt: 10, deletedAt: 10 })]
		const merged = mergeMemoryDocuments(current, incoming)
		expect(merged.items[0]?.deletedAt).toBe(10)
	})

	it('adds items that do not exist yet', () => {
		const merged = mergeMemoryDocuments([], [item({ id: 'a' }), item({ id: 'b' })])
		expect(merged.added).toBe(2)
		expect(merged.items).toHaveLength(2)
	})
})

describe('purgeTombstones', () => {
	it('drops tombstones past the retention window and keeps the rest', () => {
		const now = 100 * MEMORY_TOMBSTONE_MS
		const old = item({ id: 'old', deletedAt: 1 })
		const recent = item({ id: 'recent', deletedAt: now - 1000 })
		const live = item({ id: 'live' })
		expect(purgeTombstones([old, recent, live], now).map((entry) => entry.id)).toEqual(['recent', 'live'])
	})
})
