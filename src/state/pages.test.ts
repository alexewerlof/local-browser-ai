import { describe, expect, it } from 'vitest'
import { bindPages, findAttachedPage, isPageReference, nextPageHandle, pagesStore, removePage } from './pages'
import { freezePage } from '../core/context/page-block'
import type { PageSnapshot } from '../core/types'

function snapshot(url: string, handle = 'p1'): PageSnapshot {
	return {
		id: `page-${handle}`,
		conversationId: 'c1',
		handle,
		url,
		title: 'Example',
		markdown: 'text',
		outline: [],
		chunks: [],
		capturedAt: 0,
		truncated: false,
		totalChars: 4,
		block: 'block',
	}
}

describe('findAttachedPage', () => {
	const pages = [snapshot('https://example.com/docs/page/')]

	it('finds the page by its exact URL', () => {
		expect(findAttachedPage('https://example.com/docs/page/', pages)?.handle).toBe('p1')
	})

	it('ignores a trailing slash, a hash and the scheme host case', () => {
		expect(findAttachedPage('https://example.com/docs/page', pages)?.handle).toBe('p1')
		expect(findAttachedPage('https://example.com/docs/page#section-2', pages)?.handle).toBe('p1')
		expect(findAttachedPage('HTTPS://Example.com/docs/page', pages)?.handle).toBe('p1')
	})

	it('keeps the query string, because that is a different document', () => {
		expect(findAttachedPage('https://example.com/docs/page/?tab=2', pages)).toBeUndefined()
	})

	it('returns undefined for a page that is not in the chat', () => {
		expect(findAttachedPage('https://example.com/other', pages)).toBeUndefined()
		expect(findAttachedPage('https://example.com/other', [])).toBeUndefined()
	})
})

describe('nextPageHandle', () => {
	it('counts up from the highest live handle', () => {
		expect(nextPageHandle([])).toBe('p1')
		expect(nextPageHandle([snapshot('https://a.example', 'p1'), snapshot('https://b.example', 'p2')])).toBe('p3')
	})

	it("does not hand a removed page's handle to the next capture", () => {
		// p1 was taken back and p2 is still in the chat: the count alone would say p2.
		expect(nextPageHandle([snapshot('https://b.example', 'p2')])).toBe('p3')
	})
})

describe('isPageReference', () => {
	it('keeps a search result out of the references', () => {
		expect(isPageReference(snapshot('https://example.com'))).toBe(true)
		expect(isPageReference({ ...snapshot('https://example.com'), source: 'search' })).toBe(false)
	})

	it('stamps the source when the page is frozen', () => {
		const { block: _block, ...captured } = snapshot('https://www.google.com/search?q=test')
		expect(freezePage(captured, 'c1', 'p1').source).toBe('user')
		expect(freezePage(captured, 'c1', 'p1', 'search').source).toBe('search')
	})
})

describe('removePage', () => {
	it('takes back a page that has not reached a turn', async () => {
		const pending = snapshot('https://example.com/pending')
		bindPages([pending])
		expect(await removePage(pending)).toBe(true)
		expect(pagesStore.get()).toEqual([])
	})

	it('refuses a page a turn already carries', async () => {
		const sent: PageSnapshot = { ...snapshot('https://example.com/sent'), messageId: 'msg-1' }
		bindPages([sent])
		expect(await removePage(sent)).toBe(false)
		expect(pagesStore.get()).toHaveLength(1)
	})
})
