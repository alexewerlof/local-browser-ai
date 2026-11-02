import { describe, expect, it } from 'vitest'
import type { PageAttachment } from '../types'
import { describePageSize, pageStats, renderPageIndex } from './page-index'
import { estimateTokens } from './tokens'

function page(overrides: Partial<PageAttachment> = {}): PageAttachment {
	const markdown = [
		'# Example Pricing',
		'',
		'Example makes collaboration software for small teams.',
		'',
		'## Teams',
		'',
		'The Teams plan costs 25 EUR per seat and includes shared workspaces and audit logs.',
		'',
		'## Enterprise',
		'',
		'Enterprise pricing is annual and includes a dedicated support engineer.',
	].join('\n')

	return {
		id: 'page',
		url: 'https://example.com/pricing',
		title: 'Example Pricing',
		markdown,
		outline: [
			{ id: 'h0', level: 1, text: 'Example Pricing', line: 0 },
			{ id: 'h1', level: 2, text: 'Teams', line: 4 },
			{ id: 'h2', level: 2, text: 'Enterprise', line: 8 },
		],
		chunks: [
			{
				id: 'c0',
				heading: 'Example Pricing',
				text: 'Example makes collaboration software for small teams.',
				line: 0,
			},
			{
				id: 'c1',
				heading: 'Teams',
				text: 'The Teams plan costs 25 EUR per seat and includes shared workspaces and audit logs.',
				line: 4,
			},
			{
				id: 'c2',
				heading: 'Enterprise',
				text: 'Enterprise pricing is annual and includes a dedicated support engineer.',
				line: 8,
			},
		],
		capturedAt: 0,
		stale: false,
		truncated: false,
		totalChars: markdown.length,
		...overrides,
	}
}

describe('pageStats', () => {
	it('counts words, sections, code blocks and links', () => {
		const stats = pageStats(
			page({
				markdown:
					'# Title\n\nSee [docs](https://example.com/docs).\n\n```js\nconst a = 1\n```\n\n| a | b |\n| - | - |\n',
			}),
		)
		expect(stats.sections).toBe(3)
		expect(stats.codeBlocks).toBe(1)
		expect(stats.links).toBe(1)
		expect(stats.tables).toBe(2)
		expect(stats.words).toBeGreaterThan(5)
	})

	it('describes the size in one line', () => {
		const line = describePageSize({ words: 1_240, sections: 18, codeBlocks: 3, links: 42, tables: 0 })
		expect(line).toBe('1,240 words · 18 sections · 3 code blocks · 42 links')
	})
})

describe('renderPageIndex', () => {
	it('lists the outline with ids and section sizes', () => {
		const index = renderPageIndex(page())
		expect(index).toContain('### Outline (id, heading, reading size)')
		expect(index).toMatch(/\[h1\] Teams — ~\d+ tok/)
		expect(index).toContain('[h2] Enterprise')
	})

	it('marks the sections that match the question', () => {
		const index = renderPageIndex(page(), { query: 'how much are audit logs' })
		expect(index).toMatch(/Teams.*←/)
		expect(index).toContain('### Sections matching the question')
		expect(index).toContain('25 EUR per seat')
	})

	it('quotes previews only for relevant sections', () => {
		const index = renderPageIndex(page(), { query: 'annual support engineer', previews: 1 })
		expect(index).toContain('Enterprise')
		expect(index).toContain('dedicated support engineer')
		expect(index).not.toContain('previews: 0')
	})

	it('skips the title when rendering the opening', () => {
		const index = renderPageIndex(page(), { leadChars: 40 })
		expect(index).toContain('Example makes collaboration software')
		expect(index.match(/# Example Pricing/g)).toBeNull()
	})

	it('can omit the outline for outline-free use', () => {
		const index = renderPageIndex(page(), { hideOutline: true })
		expect(index).not.toContain('### Outline')
		expect(index).toContain('### Opening')
	})

	it('caps huge outlines and says how many were left out', () => {
		const outline = Array.from({ length: 120 }, (_, i) => ({
			id: `h${i}`,
			level: 2,
			text: `Section ${i}`,
			line: i,
		}))
		const index = renderPageIndex(page({ outline }))
		expect(index).toContain('[h59] Section 59')
		expect(index).not.toContain('[h60] Section 60')
		expect(index).toContain('+60 more headings')
	})

	it('stays tiny next to the page it describes', () => {
		const long = page({
			markdown: `# Big\n\n${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(800)}`,
		})
		const index = renderPageIndex(long)
		expect(estimateTokens(index)).toBeLessThan(estimateTokens(long.markdown) / 20)
	})

	it('tells the model how to read the rest', () => {
		expect(renderPageIndex(page())).toContain('read_page_section')
	})

	it('handles a page without headings', () => {
		const index = renderPageIndex(page({ outline: [], chunks: [] }))
		expect(index).toContain('no headings found')
		expect(index).toContain('### Opening')
	})
})
