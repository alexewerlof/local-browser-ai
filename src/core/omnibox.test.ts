import { describe, expect, it } from 'vitest'
import {
	MAX_OMNIBOX_PROMPT_CHARS,
	OMNIBOX_PROMPT_TTL_MS,
	normalizeOmniboxPrompt,
	readPendingOmniboxPrompt,
} from './omnibox'

describe('normalizeOmniboxPrompt', () => {
	it('trims the text the omnibox hands over', () => {
		expect(normalizeOmniboxPrompt('  how much is the starter plan?  ')).toBe('how much is the starter plan?')
	})

	it('refuses blank input and non-strings', () => {
		expect(normalizeOmniboxPrompt('')).toBeNull()
		expect(normalizeOmniboxPrompt('   \n\t ')).toBeNull()
		expect(normalizeOmniboxPrompt(undefined)).toBeNull()
		expect(normalizeOmniboxPrompt(42)).toBeNull()
	})

	it('caps a pasted document', () => {
		const text = normalizeOmniboxPrompt('a'.repeat(MAX_OMNIBOX_PROMPT_CHARS + 100))
		expect(text).toHaveLength(MAX_OMNIBOX_PROMPT_CHARS)
	})
})

describe('readPendingOmniboxPrompt', () => {
	const now = 1_000_000

	it('keeps the tab the entry was accepted on', () => {
		expect(readPendingOmniboxPrompt({ text: 'hi', tabId: 7, createdAt: now }, now)).toEqual({
			text: 'hi',
			tabId: 7,
			createdAt: now,
		})
	})

	it('accepts an entry without a tab', () => {
		expect(readPendingOmniboxPrompt({ text: 'hi', createdAt: now }, now)).toEqual({ text: 'hi', createdAt: now })
	})

	it('drops a malformed entry instead of trusting it', () => {
		expect(readPendingOmniboxPrompt(null, now)).toBeNull()
		expect(readPendingOmniboxPrompt('hi', now)).toBeNull()
		expect(readPendingOmniboxPrompt({ text: '   ', createdAt: now }, now)).toBeNull()
		expect(readPendingOmniboxPrompt({ text: 'hi' }, now)).toBeNull()
		expect(readPendingOmniboxPrompt({ text: 'hi', createdAt: 'now' }, now)).toBeNull()
		expect(readPendingOmniboxPrompt({ text: 'hi', tabId: 'seven', createdAt: now }, now)).toEqual({
			text: 'hi',
			createdAt: now,
		})
	})

	it('drops an entry the panel never took', () => {
		const stale = now - OMNIBOX_PROMPT_TTL_MS - 1
		expect(readPendingOmniboxPrompt({ text: 'hi', createdAt: stale }, now)).toBeNull()
		// Exactly at the limit is still fresh.
		expect(readPendingOmniboxPrompt({ text: 'hi', createdAt: now - OMNIBOX_PROMPT_TTL_MS }, now)).not.toBeNull()
	})
})
