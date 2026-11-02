import { Readability } from '@mozilla/readability'
import type { PageAttachment, PageRepresentation } from '../../core/types'
import { createId, now } from '../../core/util'
import type { InjectResult } from './inject'
import { htmlToMarkdown } from './markdown'
import { splitIntoSections } from './sections'

/** Below this, Readability's output is treated as a failure and we fall back. */
const MIN_ARTICLE_CHARS = 400
/** An accessibility skeleton shorter than this says nothing useful. */
const MIN_ARIA_CHARS = 200
/** Interactive elements before a page counts as an app surface rather than prose. */
const APP_CONTROLS = 5

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
 * structure. When it fails (app shells, dashboards, forms) the accessibility skeleton
 * is a far better description than the page's markup, so it wins over the markdown
 * fallback on control-heavy pages. Plain cleaned markdown and then the page's own
 * innerText are the last resorts.
 */
export function processExtraction(result: InjectResult): PageAttachment {
	const article = readabilityMarkdown(result.html)
	let markdown = article?.markdown ?? ''
	let representation: PageRepresentation = 'article'
	let title = result.title || article?.title || ''

	const aria = (result.aria ?? '').trim()
	const appShaped = !markdown && aria.length >= MIN_ARIA_CHARS && (result.controls ?? 0) >= APP_CONTROLS

	if (appShaped) {
		markdown = aria
		representation = 'app'
	} else if (!markdown) {
		markdown = htmlToMarkdown(result.html)
		representation = 'text'
	}

	if (markdown.length < MIN_ARTICLE_CHARS && result.text.length > markdown.length) {
		markdown = result.text
		representation = 'text'
	}

	if (!title) title = titleFromMarkdown(markdown) || new URL(result.url).hostname

	const { outline, chunks } = splitIntoSections(markdown)

	return {
		id: createId('page'),
		url: result.url,
		title,
		faviconUrl: result.faviconUrl || undefined,
		lang: result.lang || undefined,
		markdown,
		representation,
		outline,
		chunks,
		capturedAt: now(),
		stale: false,
		truncated: result.truncated,
		totalChars: markdown.length,
	}
}
