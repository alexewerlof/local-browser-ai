import { describe, expect, it } from 'vitest'
import { describePageAccess, PAGE_ACCESS_LABELS, type PageAccessRequest } from './page-access'

const confirm: PageAccessRequest = { kind: 'confirm', tabId: 42, url: 'https://example.com/pricing' }
const waitingUser: PageAccessRequest = { kind: 'waiting', tabId: 43, url: 'https://docs.example.org/x', chip: false }
const waitingChip: PageAccessRequest = { ...waitingUser, chip: true }
const waitingSearch: PageAccessRequest = {
	kind: 'waiting',
	tabId: 44,
	url: 'https://www.google.com/search?q=x',
	chip: false,
	source: 'search',
}

describe('describePageAccess', () => {
	it('asks before anything is requested from Chrome', () => {
		const copy = describePageAccess(confirm, 'example.com')
		// The two routes have to be named: the permanent grant this box leads to, and the
		// one-page read through the browser's own UI.
		expect(copy.message).toMatch(/Add to chat/)
		expect(copy.message).toMatch(/extension icon/)
		expect(copy.recommendPermanent).toBe(false)
	})

	it('says the grant covers the whole site, not just the page on screen', () => {
		// Allowing `kaddio.com/c/test` allows everything on kaddio.com, which is the part a
		// reader would otherwise not expect from a button under one page.
		const copy = describePageAccess(confirm, 'kaddio.com')
		expect(copy.message).toContain('read and change your data on kaddio.com')
		expect(copy.message).toMatch(/permanent/)
		expect(copy.message).toMatch(/temporary/)
	})

	it('recommends the permanent grant for a search, and only for a search', () => {
		expect(describePageAccess(waitingSearch, 'www.google.com').recommendPermanent).toBe(true)
		expect(describePageAccess({ ...waitingSearch, chip: true }, 'www.google.com').recommendPermanent).toBe(true)
		expect(describePageAccess(waitingUser, 'docs.example.org').recommendPermanent).toBe(false)
		expect(describePageAccess(waitingChip, 'docs.example.org').recommendPermanent).toBe(false)
		expect(describePageAccess(confirm, 'example.com').recommendPermanent).toBe(false)
	})

	it('mentions the address-bar prompt only when Chrome was handed a chip', () => {
		// `chip` records the attempt, not a result: without one there is nothing to look
		// for in the address bar, and pointing at it would be a dead end.
		expect(describePageAccess(waitingChip, 'docs.example.org').message).toMatch(/address-bar/)
		expect(describePageAccess(waitingUser, 'docs.example.org').message).not.toMatch(/address-bar/)
	})

	it('offers the one-page route before the permanent one for an ordinary page', () => {
		const copy = describePageAccess(waitingUser, 'docs.example.org')
		expect(copy.message).toMatch(/Add to chat/)
		expect(copy.message.indexOf('Add to chat')).toBeLessThan(copy.message.indexOf('Continue'))
	})

	it('names both buttons the panel renders', () => {
		expect(PAGE_ACCESS_LABELS).toEqual({ continue: 'Continue', cancel: 'Cancel' })
	})
})
