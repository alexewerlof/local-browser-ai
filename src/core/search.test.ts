import { describe, expect, it } from 'vitest'
import { planSearch, readSearchTab, withSearchTab } from './search'

describe('planSearch', () => {
	it('opens a tab when there is nothing to reuse', () => {
		expect(planSearch('NEW_TAB')).toEqual({ disposition: 'NEW_TAB' })
	})

	it('reuses the tab the last search opened', () => {
		// Chrome can only navigate the active tab, so the reused tab is activated first and
		// the search runs as CURRENT_TAB on it.
		expect(planSearch('NEW_TAB', 42)).toEqual({ disposition: 'CURRENT_TAB', tabId: 42 })
	})

	it('leaves a deliberate choice about the window alone', () => {
		expect(planSearch('CURRENT_TAB', 42)).toEqual({ disposition: 'CURRENT_TAB' })
		expect(planSearch('NEW_WINDOW', 42)).toEqual({ disposition: 'NEW_WINDOW' })
	})
})

describe('search tab memory', () => {
	it('remembers a tab per chat, so one chat cannot navigate another’s results', () => {
		const stored = withSearchTab(withSearchTab({}, 'chat-a', 42), 'chat-b', 43)
		expect(readSearchTab(stored, 'chat-a')).toBe(42)
		expect(readSearchTab(stored, 'chat-b')).toBe(43)
		expect(readSearchTab(stored, 'chat-c')).toBeUndefined()
	})

	it('replaces the tab of a chat without disturbing the others', () => {
		const stored = withSearchTab(withSearchTab({}, 'chat-a', 42), 'chat-b', 43)
		const next = withSearchTab(stored, 'chat-a', 44)
		expect(readSearchTab(next, 'chat-a')).toBe(44)
		expect(readSearchTab(next, 'chat-b')).toBe(43)
	})

	it('ignores a stored value it cannot read', () => {
		expect(readSearchTab(undefined, 'chat-a')).toBeUndefined()
		expect(readSearchTab('42', 'chat-a')).toBeUndefined()
		expect(readSearchTab({ 'chat-a': '42' }, 'chat-a')).toBeUndefined()
	})
})
