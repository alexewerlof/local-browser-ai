import { Readability } from '@mozilla/readability'
import type { PageAttachment } from '../../core/types'
import { createId, now } from '../../core/util'
import type { InjectResult } from './inject'
import { htmlToMarkdown } from './markdown'
import { splitIntoSections } from './sections'

/** Below this, Readability's output is treated as a failure and we fall back. */
const MIN_ARTICLE_CHARS = 400

function readabilityMarkdown(html: string): { markdown: string; title: string; byline: string } | null {
	try {
		const document = new DOMParser().parseFromString(html, 'text/html')
		// Readability resolves relative URLs against `documentURI`.
		const parsed = new Readability(document, { charThreshold: 100 }).parse()
		if (!parsed?.content) return null
		const markdown = htmlToMarkdown(parsed.content)
		if (markdown.length < MIN_ARTICLE_CHARS) return null
		return {
			markdown,
			title: parsed.title?.trim() ?? '',
			byline: parsed.byline?.trim() ?? '',
		}
	} catch {
		return null
	}
}

function titleFromMarkdown(markdown: string): string {
	const match = /^#\s+(.+)$/m.exec(markdown)
	return match?.[1]?.trim() ?? ''
}

/**
 * Turn a raw in-page extraction into the attachment the model and UI work with.
 *
 * Readability is the primary path because it strips navigation and keeps article
 * structure. If it fails or returns something tiny (docs sites, app shells), fall back
 * to the cleaned body HTML, and finally to the page's own innerText.
 */
export function processExtraction(result: InjectResult): PageAttachment {
	const article = readabilityMarkdown(result.html)
	let markdown = article?.markdown ?? ''
	let title = result.title || article?.title || ''

	if (!markdown) {
		markdown = htmlToMarkdown(result.html)
	}
	if (markdown.length < MIN_ARTICLE_CHARS && result.text.length > markdown.length) {
		markdown = result.text
	}

	if (!title) title = titleFromMarkdown(markdown) || new URL(result.url).hostname

	const { outline, chunks } = splitIntoSections(markdown)

	return {
		id: createId('page'),
		url: result.url,
		title,
		faviconUrl: result.faviconUrl || undefined,
		markdown,
		outline,
		chunks,
		capturedAt: now(),
		stale: false,
		truncated: result.truncated,
		totalChars: markdown.length,
	}
}
