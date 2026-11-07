import { describe, expect, it } from 'vitest'
import { planSearch } from './search'

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
