import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

const TRACKING_PARAMETERS = [
	'utm_source',
	'utm_medium',
	'utm_campaign',
	'utm_term',
	'utm_content',
	'utm_id',
	'gclid',
	'fbclid',
	'mc_cid',
	'mc_eid',
	'ref',
	'ref_src',
]

/** Remove tracking parameters but keep the rest of the URL intact. */
export function cleanUrl(href: string): string {
	try {
		const url = new URL(href)
		for (const parameter of TRACKING_PARAMETERS) url.searchParams.delete(parameter)
		return url.toString()
	} catch {
		return href
	}
}

function normalizeBlankLines(markdown: string): string {
	return (
		markdown
			.replace(/\r\n/g, '\n')
			// Turndown pads list markers (`-   item`); one space is enough and cheaper.
			.replace(/^(\s*)[-*+]\s{2,}/gm, '$1- ')
			.replace(/[ \t]+$/gm, '')
			.replace(/\n{3,}/g, '\n\n')
			.trim()
	)
}

function createService(): TurndownService {
	const service = new TurndownService({
		headingStyle: 'atx',
		hr: '---',
		bulletListMarker: '-',
		codeBlockStyle: 'fenced',
		fence: '```',
		emDelimiter: '*',
		strongDelimiter: '**',
		linkStyle: 'inlined',
	})

	service.use(gfm)

	// Content that survives the extractor but is never useful in markdown.
	service.remove(['script', 'style', 'noscript', 'template', 'canvas', 'form', 'input', 'button'])

	// Fenced code blocks with the language from `class="language-<lang>"`.
	service.addRule('fencedCodeBlock', {
		filter: (node) => node.nodeName === 'PRE' && node.firstChild !== null && node.firstChild.nodeName === 'CODE',
		replacement: (_content, node) => {
			const code = node.firstChild as HTMLElement
			const className = code.getAttribute('class') ?? ''
			const language = /(?:language|lang)-([\w+#-]+)/.exec(className)?.[1] ?? ''
			const text = (code.textContent ?? '').replace(/\n+$/, '')
			return `\n\n\`\`\`${language}\n${text}\n\`\`\`\n\n`
		},
	})

	// Inline code that carries only a language class should not become a code block.
	service.addRule('inlineCode', {
		filter: (node) => node.nodeName === 'CODE' && node.parentNode?.nodeName !== 'PRE',
		replacement: (content) => {
			const text = content.replace(/\n/g, ' ')
			if (!text) return ''
			const fence = text.includes('`') ? '``' : '`'
			return `${fence}${text}${fence}`
		},
	})

	service.addRule('figure', {
		filter: 'figure',
		replacement: (content, node) => {
			const caption = node.querySelector('figcaption')?.textContent?.trim()
			const image = node.querySelector('img')
			const alt = image?.getAttribute('alt')?.trim()
			const src = image?.getAttribute('src')
			const parts: string[] = []
			if (src) parts.push(`![${alt || caption || ''}](${src})`)
			else if (caption) parts.push(`*${caption}*`)
			else parts.push(content.trim())
			if (caption && src) parts.push(`*${caption}*`)
			return `\n\n${parts.filter(Boolean).join('\n\n')}\n\n`
		},
	})

	service.addRule('details', {
		filter: 'details',
		replacement: (content) => `\n\n${content.trim()}\n\n`,
	})

	service.addRule('summary', {
		filter: 'summary',
		replacement: (content) => `**${content.trim()}**\n\n`,
	})

	service.addRule('kbd', {
		filter: 'kbd',
		replacement: (content) => `\`${content.trim()}\``,
	})

	service.addRule('links', {
		filter: (node) => node.nodeName === 'A' && Boolean((node as HTMLAnchorElement).getAttribute('href')),
		replacement: (content, node) => {
			const href = cleanUrl((node as HTMLAnchorElement).getAttribute('href') ?? '')
			const text = content.trim() || href
			if (!href || href.startsWith('javascript:')) return text
			// `[https://example.com/x](https://example.com/x)` pays for the URL twice.
			const strip = (value: string) => value.replace(/^https?:\/\/(www\.)?/, '')
			if (text === href || strip(text) === strip(href)) return text
			return `[${text}](${href})`
		},
	})

	service.addRule('images', {
		filter: 'img',
		replacement: (_content, node) => {
			const src = (node as HTMLImageElement).getAttribute('src') ?? ''
			if (!src || src.startsWith('data:')) return ''
			const alt = (node as HTMLImageElement).getAttribute('alt') ?? ''
			// Without alt text the URL is a token cost with nothing behind it.
			if (!alt.trim()) return ''
			return `![${alt}](${src})`
		},
	})

	return service
}

const service = createService()

export function htmlToMarkdown(html: string): string {
	if (!html.trim()) return ''
	return normalizeBlankLines(service.turndown(html))
}
