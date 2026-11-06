import { describe, expect, it } from 'vitest'
import { findAttachedPage } from './pages'
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
