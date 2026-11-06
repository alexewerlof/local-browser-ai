import type { PageSnapshot } from '../types'
import { bm25Rank } from './lexical'
import { estimateTokens } from './tokens'

/**
 * The compact view of an attached page that goes into the prompt by default.
 *
 * A long page costs far more to prefill than it is worth: on a local model the
 * whole page is re-read on every turn and eats the KV cache. The index keeps the
 * shape of the page (headings, size, a hint at where the answer lives) so the
 * model can ask for exactly the section it needs.
 */
export interface PageIndexOptions {
	/** Text of the current user turn, used to pick the "relevant" headings. */
	query?: string
	/** Characters of the page opening kept as a lead-in. */
	leadChars?: number
	/** How many sections get a quoted preview. */
	previews?: number
	/** Omit the outline entirely, keeping only stats, previews and the lead. */
	hideOutline?: boolean
}

export interface PageStats {
	words: number
	sections: number
	codeBlocks: number
	links: number
	tables: number
}

const MAX_OUTLINE_ENTRIES = 60
const MAX_HEADING_CHARS = 72
const MAX_PREVIEW_CHARS = 200
const DEFAULT_LEAD_CHARS = 600
const DEFAULT_PREVIEWS = 3

export function pageStats(attachment: PageSnapshot): PageStats {
	const markdown = attachment.markdown
	const words = (markdown.match(/\S+/g) ?? []).length
	const fences = (markdown.match(/^```/gm) ?? []).length
	const links = (markdown.match(/\]\(/g) ?? []).length
	const tableRows = (markdown.match(/^\s*\|.*\|\s*$/gm) ?? []).length
	return {
		words,
		sections: attachment.outline.length,
		codeBlocks: Math.floor(fences / 2),
		links,
		tables: tableRows,
	}
}

function formatCount(value: number): string {
	return value.toLocaleString('en-US')
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
	return `${formatCount(count)} ${count === 1 ? singular : pluralForm}`
}

/** One compact line describing how much there is to read. */
export function describePageSize(stats: PageStats): string {
	const parts = [plural(stats.words, 'word'), plural(stats.sections, 'section')]
	if (stats.codeBlocks > 0) parts.push(plural(stats.codeBlocks, 'code block'))
	if (stats.tables > 0) parts.push(plural(stats.tables, 'table row'))
	if (stats.links > 0) parts.push(plural(stats.links, 'link'))
	return parts.join(' · ')
}

function clip(text: string, limit: number): string {
	const flat = text.replace(/\s+/g, ' ').trim()
	if (flat.length <= limit) return flat
	const cut = flat.slice(0, limit)
	const space = cut.lastIndexOf(' ')
	return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** Estimated token cost per section heading, so sizes are visible at a glance. */
function sectionCosts(attachment: PageSnapshot): Map<string, number> {
	const costs = new Map<string, number>()
	for (const chunk of attachment.chunks) {
		costs.set(chunk.heading, (costs.get(chunk.heading) ?? 0) + estimateTokens(chunk.text))
	}
	return costs
}

/** Headings worth quoting because they answer the current question. */
function previewBlocks(attachment: PageSnapshot, query: string, count: number): string[] {
	if (count <= 0) return []
	const ranked = bm25Rank(
		attachment.chunks.map((chunk) => ({ id: chunk.id, text: `${chunk.heading}\n${chunk.text}` })),
		query,
		Math.max(count * 3, 6),
	)
	const seen = new Set<string>()
	const blocks: string[] = []
	for (const hit of ranked) {
		const chunk = attachment.chunks.find((candidate) => candidate.id === hit.id)
		if (!chunk) continue
		const key = chunk.heading || 'Page'
		if (seen.has(key)) continue
		seen.add(key)
		const id = attachment.outline.find((entry) => entry.text === chunk.heading)?.id
		const label = id ? `${chunk.heading} (${id})` : chunk.heading || 'Page'
		blocks.push(`- ${label}: "${clip(chunk.text, MAX_PREVIEW_CHARS)}"`)
		if (blocks.length >= count) break
	}
	return blocks
}

/** Mark headings that the current question points at. */
function highlightedHeadings(attachment: PageSnapshot, query: string): Set<string> {
	const headings = new Set<string>()
	if (!query.trim()) return headings
	const ranked = bm25Rank(
		attachment.chunks.map((chunk) => ({ id: chunk.id, text: `${chunk.heading}\n${chunk.text}` })),
		query,
		Math.max(attachment.outline.length, 1),
	)
	for (const hit of ranked.slice(0, 5)) {
		const chunk = attachment.chunks.find((candidate) => candidate.id === hit.id)
		if (chunk?.heading) headings.add(chunk.heading)
	}
	return headings
}

function renderOutlineLines(attachment: PageSnapshot, options: PageIndexOptions): string[] {
	const costs = sectionCosts(attachment)
	const highlighted = highlightedHeadings(attachment, options.query ?? '')
	const entries = attachment.outline
	if (entries.length === 0) return ['(no headings found — the page has no structure to index)']

	const visible = entries.slice(0, MAX_OUTLINE_ENTRIES)
	const lines = visible.map((entry) => {
		const indent = '  '.repeat(Math.max(0, Math.min(entry.level - 1, 4)))
		const cost = costs.get(entry.text)
		const size = cost === undefined ? '' : ` — ~${formatCount(cost)} tok`
		const mark = highlighted.has(entry.text) ? ' ←' : ''
		return `${indent}- [${entry.id}] ${clip(entry.text, MAX_HEADING_CHARS)}${size}${mark}`
	})

	const hidden = entries.length - visible.length
	if (hidden > 0) lines.push(`- (+${formatCount(hidden)} more headings; use find_in_page to search the rest)`)
	return lines
}

/** Keep only the leading prose of the page, cut at a paragraph or word boundary. */
function renderLead(attachment: PageSnapshot, leadChars: number): string {
	const markdown = attachment.markdown.trim()
	if (!markdown || leadChars <= 0) return ''
	// Skip the title line so the lead is not just a repeated heading.
	const body = markdown.replace(/^#\s+.+\n+/, '').trim()
	const slice = body.slice(0, leadChars)
	const boundary = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '))
	const cut = boundary > leadChars * 0.5 ? slice.slice(0, boundary + 1) : slice
	return cut.trim()
}

/**
 * Render the prompt-sized index of an attached page.
 *
 * Output is deliberately terse: roughly a few hundred tokens for a page with
 * dozens of sections, against thousands of tokens for the cleaned markdown.
 */
export function renderPageIndex(attachment: PageSnapshot, options: PageIndexOptions = {}): string {
	const stats = pageStats(attachment)
	const leadChars = options.leadChars ?? DEFAULT_LEAD_CHARS
	const previews = options.previews ?? DEFAULT_PREVIEWS

	const lines = ['### At a glance', describePageSize(stats)]

	if (!options.hideOutline) {
		lines.push('', '### Outline (id, heading, reading size)', ...renderOutlineLines(attachment, options))
	}

	const previewsBlocks = previewBlocks(attachment, options.query ?? '', previews)
	if (previewsBlocks.length > 0) {
		lines.push('', '### Sections matching the question', ...previewsBlocks)
	}

	const lead = renderLead(attachment, leadChars)
	if (lead) lines.push('', '### Opening', lead)

	lines.push(
		'',
		'Only this index is in the prompt. Call `read_page_section` with a heading or `[id]` to read a section, or `find_in_page` to search for a phrase.',
	)

	return lines.join('\n')
}
