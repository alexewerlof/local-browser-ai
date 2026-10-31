import MarkdownIt from 'markdown-it'
import type { OutlineEntry, PageAttachment, PageChunk } from '../../core/types'
import { createId } from '../../core/util'

const parser = new MarkdownIt()

/** Sections larger than this are split at paragraph boundaries. */
const MAX_CHUNK_CHARS = 2400
/** Sections smaller than this are merged into the previous one. */
const MIN_CHUNK_CHARS = 200

export interface SectionSplit {
	outline: OutlineEntry[]
	chunks: PageChunk[]
}

function splitLongText(text: string): string[] {
	if (text.length <= MAX_CHUNK_CHARS) return [text]
	const paragraphs = text.split(/\n{2,}/)
	const parts: string[] = []
	let current = ''
	for (const paragraph of paragraphs) {
		if (current.length + paragraph.length + 2 > MAX_CHUNK_CHARS && current) {
			parts.push(current)
			current = paragraph
		} else {
			current = current ? `${current}\n\n${paragraph}` : paragraph
		}
	}
	if (current) parts.push(current)
	return parts
}

/**
 * Split markdown at heading boundaries.
 *
 * Every heading starts a new chunk, which lines up with how people talk about a page
 * ("what does the Pricing section say?"). Oversized sections are split further so a
 * single chunk stays useful as a retrieval unit.
 */
export function splitIntoSections(markdown: string): SectionSplit {
	const lines = markdown.split('\n')
	const tokens = parser.parse(markdown, {})

	const headings = tokens
		.map((token, index) => ({ token, index }))
		.filter(({ token }) => token.type === 'heading_open')
		.map(({ token, index }) => {
			const inline = tokens[index + 1]
			const text = (inline?.content ?? '').trim()
			return {
				level: Number(token.tag.replace('h', '')) || 1,
				text,
				line: token.map?.[0] ?? 0,
			}
		})

	const outline: OutlineEntry[] = headings.map((heading, index) => ({
		id: `h${index}`,
		level: heading.level,
		text: heading.text || `Section ${index + 1}`,
		line: heading.line,
	}))

	const chunks: PageChunk[] = []
	const pushChunk = (heading: string, body: string, line: number) => {
		const text = body.trim()
		if (!text) return
		for (const part of splitLongText(text)) {
			chunks.push({
				id: createId('chunk'),
				heading,
				text: part,
				line,
			})
		}
	}

	if (headings.length === 0) {
		pushChunk('', markdown, 0)
		return { outline, chunks }
	}

	const introEnd = headings[0]?.line ?? 0
	const intro = lines.slice(0, introEnd).join('\n').trim()
	if (intro) pushChunk('Introduction', intro, 0)

	headings.forEach((heading, index) => {
		const start = heading.line
		const end = headings[index + 1]?.line ?? lines.length
		const body = lines.slice(start, end).join('\n')
		// Drop the heading line itself; the chunk carries it as a label.
		const withoutHeading = body.split('\n').slice(1).join('\n')
		pushChunk(heading.text, withoutHeading, start)
	})

	// Merge tiny neighbours so we do not embed heading-only fragments.
	const merged: PageChunk[] = []
	for (const chunk of chunks) {
		const previous = merged[merged.length - 1]
		if (previous && previous.text.length < MIN_CHUNK_CHARS && previous.heading === chunk.heading) {
			previous.text = `${previous.text}\n\n${chunk.text}`
			continue
		}
		merged.push({ ...chunk })
	}

	return { outline, chunks: merged }
}

/** Read a section by outline id, heading text, or a fuzzy match. */
export function readSection(attachment: PageAttachment, reference: string): { heading: string; text: string } | null {
	const needle = reference.trim().toLowerCase()
	if (!needle) return null

	const byId = attachment.outline.find((entry) => entry.id === reference)
	const heading =
		byId ??
		attachment.outline.find((entry) => entry.text.toLowerCase() === needle) ??
		attachment.outline.find((entry) => entry.text.toLowerCase().includes(needle))

	const matching = heading
		? attachment.chunks.filter((chunk) => chunk.heading === heading.text)
		: attachment.chunks.filter((chunk) => chunk.text.toLowerCase().includes(needle))

	if (matching.length === 0) return null
	return {
		heading: heading?.text ?? matching[0]?.heading ?? reference,
		text: matching.map((chunk) => chunk.text).join('\n\n'),
	}
}

/** Substring search with a little context, grouped by section. */
export function findInAttachment(
	attachment: PageAttachment,
	query: string,
	limit = 5,
): Array<{ heading: string; snippet: string }> {
	const needle = query.trim().toLowerCase()
	if (!needle) return []
	const results: Array<{ heading: string; snippet: string }> = []

	for (const chunk of attachment.chunks) {
		const haystack = chunk.text.toLowerCase()
		let index = haystack.indexOf(needle)
		while (index !== -1 && results.length < limit) {
			const start = Math.max(0, index - 160)
			const end = Math.min(chunk.text.length, index + needle.length + 240)
			const prefix = start > 0 ? '…' : ''
			const suffix = end < chunk.text.length ? '…' : ''
			results.push({
				heading: chunk.heading || 'Page',
				snippet: `${prefix}${chunk.text.slice(start, end).trim()}${suffix}`,
			})
			index = haystack.indexOf(needle, index + needle.length)
		}
		if (results.length >= limit) break
	}

	return results
}
