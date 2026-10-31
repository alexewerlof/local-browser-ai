import { describe, expect, it } from 'vitest'
import { bm25Rank, tokenize } from './lexical'

const documents = [
	{ id: 'pricing', text: 'The Starter plan costs 10 EUR per month. Teams pricing is 25 EUR per seat.' },
	{ id: 'security', text: 'Audit logs and SSO are available for enterprise customers.' },
	{ id: 'faq', text: 'Can I change plans at any time? Upgrades are prorated.' },
]

describe('tokenize', () => {
	it('lowercases and drops stop words and one-letter tokens', () => {
		expect(tokenize('The Plan is a good plan')).toEqual(['plan', 'good', 'plan'])
	})

	it('keeps unicode words', () => {
		expect(tokenize('日本語のページ')).toEqual(['日本語のページ'])
	})
})

describe('bm25Rank', () => {
	it('ranks the section containing the query terms first', () => {
		const ranked = bm25Rank(documents, 'how much does the team plan cost')
		expect(ranked[0]?.id).toBe('pricing')
	})

	it('finds sections by a single distinctive term', () => {
		const ranked = bm25Rank(documents, 'audit logs')
		expect(ranked[0]?.id).toBe('security')
	})

	it('returns nothing when every query term is a stop word', () => {
		expect(bm25Rank(documents, 'the of and')).toEqual([])
	})

	it('respects the result limit', () => {
		const ranked = bm25Rank(documents, 'plans pricing enterprise', 2)
		expect(ranked.length).toBeLessThanOrEqual(2)
	})

	it('handles an empty document list', () => {
		expect(bm25Rank([], 'pricing')).toEqual([])
	})
})
