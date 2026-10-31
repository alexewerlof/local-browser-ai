import { describe, expect, it } from 'vitest'
import { findInAttachment, readSection, splitIntoSections } from './sections'
import type { PageAttachment } from '../../core/types'

const markdown = [
	'Intro paragraph before any heading.',
	'',
	'# Pricing',
	'',
	'Starter costs 10 EUR per month.',
	'',
	'## Teams',
	'',
	'Teams costs 25 EUR per seat and adds audit logs.',
	'',
	'### Nested detail',
	'',
	'Annual billing saves 20 percent.',
].join('\n')

describe('splitIntoSections', () => {
	it('captures the intro and every heading in the outline', () => {
		const { outline, chunks } = splitIntoSections(markdown)
		expect(outline.map((entry) => entry.text)).toEqual(['Pricing', 'Teams', 'Nested detail'])
		expect(chunks[0]?.heading).toBe('Introduction')
		expect(chunks.map((chunk) => chunk.heading)).toContain('Teams')
	})

	it('does not include the heading line inside the chunk body', () => {
		const { chunks } = splitIntoSections(markdown)
		const teams = chunks.find((chunk) => chunk.heading === 'Teams')
		expect(teams?.text).toContain('25 EUR')
		expect(teams?.text.startsWith('##')).toBe(false)
	})

	it('returns one chunk for a page without headings', () => {
		const { outline, chunks } = splitIntoSections('Just a flat page of text.')
		expect(outline).toEqual([])
		expect(chunks).toHaveLength(1)
	})

	it('splits oversized sections into multiple chunks', () => {
		const long = `# Long\n\n${Array.from({ length: 80 }, () => 'A paragraph with quite a few words in it.').join('\n\n')}`
		const { chunks } = splitIntoSections(long)
		expect(chunks.length).toBeGreaterThan(1)
		for (const chunk of chunks) {
			expect(chunk.text.length).toBeLessThanOrEqual(2600)
		}
	})
})

function attachment(): PageAttachment {
	const { outline, chunks } = splitIntoSections(markdown)
	return {
		id: 'p',
		url: 'https://example.com',
		title: 'Example',
		markdown,
		outline,
		chunks,
		capturedAt: 0,
		stale: false,
		truncated: false,
		totalChars: markdown.length,
	}
}

describe('readSection', () => {
	it('reads by exact heading', () => {
		const section = readSection(attachment(), 'Teams')
		expect(section?.text).toContain('25 EUR')
	})

	it('reads by partial heading', () => {
		const section = readSection(attachment(), 'team')
		expect(section?.heading).toBe('Teams')
	})

	it('reads by outline id', () => {
		const section = readSection(attachment(), 'h0')
		expect(section?.heading).toBe('Pricing')
	})

	it('falls back to a body match', () => {
		const section = readSection(attachment(), 'annual billing')
		expect(section?.text.toLowerCase()).toContain('annual billing')
	})

	it('returns null for a missing section', () => {
		expect(readSection(attachment(), 'Blockchain')).toBeNull()
	})
})

describe('findInAttachment', () => {
	it('returns snippets with their section', () => {
		const matches = findInAttachment(attachment(), 'EUR')
		expect(matches.length).toBeGreaterThan(0)
		expect(matches[0]?.heading).toBeDefined()
		expect(matches[0]?.snippet).toContain('EUR')
	})

	it('is case insensitive', () => {
		expect(findInAttachment(attachment(), 'teams').length).toBeGreaterThan(0)
	})

	it('respects the limit', () => {
		expect(findInAttachment(attachment(), 'the', 1).length).toBeLessThanOrEqual(1)
	})

	it('returns nothing for an empty query', () => {
		expect(findInAttachment(attachment(), '   ')).toEqual([])
	})
})
