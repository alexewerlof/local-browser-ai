/**
 * The extraction function is serialized by `chrome.scripting.executeScript({ func })`,
 * so it must be completely self-contained: no imports, no module-level helpers, no
 * closures over variables. Everything it needs is declared inside the function body.
 */

export type InjectMode = 'page' | 'selection'

export interface InjectRequest {
	mode: InjectMode
	/** Hard cap on the serialized HTML, to protect the message channel. */
	maxHtmlChars?: number
}

export interface InjectResult {
	url: string
	baseUrl: string
	canonicalUrl: string
	title: string
	description: string
	lang: string
	faviconUrl: string
	byline: string
	publishedTime: string
	html: string
	text: string
	selection: string
	/** True when a size cap cut the payload. */
	truncated: boolean
	/** Error message when extraction itself failed inside the page. */
	error?: string
}

export function extractPageInPageContext(request: InjectRequest): InjectResult {
	const maxHtmlChars = request.maxHtmlChars ?? 1_500_000

	const empty: InjectResult = {
		url: location.href,
		baseUrl: document.baseURI,
		canonicalUrl: '',
		title: document.title,
		description: '',
		lang: document.documentElement.lang || '',
		faviconUrl: '',
		byline: '',
		publishedTime: '',
		html: '',
		text: '',
		selection: '',
		truncated: false,
	}

	try {
		const meta = (selector: string): string => {
			const element = document.querySelector<HTMLMetaElement>(selector)
			return element?.content?.trim() ?? ''
		}

		const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
		const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
		const absolute = (value: string): string => {
			if (!value) return ''
			try {
				return new URL(value, document.baseURI).toString()
			} catch {
				return value
			}
		}

		const selection = (() => {
			try {
				return window.getSelection()?.toString().trim() ?? ''
			} catch {
				return ''
			}
		})()

		const metadata = {
			...empty,
			canonicalUrl: absolute(canonical?.href ?? ''),
			faviconUrl: absolute(icon?.href ?? ''),
			description:
				meta('meta[name="description"]') ||
				meta('meta[property="og:description"]') ||
				meta('meta[name="twitter:description"]'),
			byline: meta('meta[name="author"]') || meta('meta[property="article:author"]'),
			publishedTime: meta('meta[property="article:published_time"]') || meta('meta[name="date"]'),
			selection,
		}

		if (request.mode === 'selection') return metadata

		const REMOVE_TAGS = [
			'script',
			'style',
			'noscript',
			'template',
			'svg',
			'canvas',
			'iframe',
			'object',
			'embed',
			'video',
			'audio',
			'source',
			'track',
			'form',
			'input',
			'button',
			'select',
			'textarea',
			'option',
			'progress',
			'meter',
			'dialog',
			// Pure navigation chrome. `<header>` and `<footer>` stay: inside an article they
			// often carry the title and byline, and Readability knows how to handle them.
			'nav',
			'aside',
		]
		const REMOVE_TAGS_SET = new Set(REMOVE_TAGS)
		const KEEP_ATTRIBUTES = new Set([
			'href',
			'src',
			'alt',
			'title',
			'colspan',
			'rowspan',
			'start',
			'datetime',
			'lang',
			'dir',
			'type',
			'role',
			'aria-label',
			'aria-hidden',
		])
		/** `class` survives only where it carries code language information. */
		const KEEP_CLASS_TAGS = new Set(['CODE', 'PRE'])

		/**
		 * Whether a live element contributes nothing visible. Must be evaluated on the
		 * original node: the clone drops the attributes (`hidden`) that prove it.
		 */
		const isHidden = (element: Element): boolean => {
			if (element.hasAttribute('hidden')) return true
			if (element.getAttribute('aria-hidden') === 'true') return true
			const style = (element as HTMLElement).style
			if (style?.display === 'none' || style?.visibility === 'hidden') return true
			const check = (element as Element & { checkVisibility?: (options?: object) => boolean }).checkVisibility
			if (typeof check === 'function') {
				try {
					return !check.call(element, { checkVisibilityCSS: true })
				} catch {
					return false
				}
			}
			return false
		}

		/** Deep-clone a node, following open shadow roots so web components keep their text. */
		const cloneWithShadow = (node: Node, into: Node): void => {
			if (node.nodeType === Node.TEXT_NODE) {
				into.appendChild(document.createTextNode(node.nodeValue ?? ''))
				return
			}
			if (node.nodeType !== Node.ELEMENT_NODE) return

			const element = node as Element
			if (isHidden(element)) return
			const copy = document.createElement(element.tagName)

			for (const attribute of Array.from(element.attributes)) {
				const name = attribute.name.toLowerCase()
				if (!KEEP_ATTRIBUTES.has(name) && !KEEP_CLASS_TAGS.has(element.tagName)) continue
				if (name === 'style' || name.startsWith('on')) continue
				if (element.tagName === 'IMG' && name === 'src') {
					copy.setAttribute('src', absolute(attribute.value))
					continue
				}
				if (element.tagName === 'A' && name === 'href') {
					copy.setAttribute('href', absolute(attribute.value))
					continue
				}
				if (name === 'srcset') continue
				copy.setAttribute(name, attribute.value)
			}

			const shadow = (element as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot
			const source = shadow ? shadow : element
			for (const child of Array.from(source.childNodes)) cloneWithShadow(child, copy)
			into.appendChild(copy)
		}

		const body = document.body
		if (!body) return { ...metadata, error: 'The page has no body element.' }

		const clone = document.createElement('div')
		for (const child of Array.from(body.childNodes)) cloneWithShadow(child, clone)

		// Same-origin iframes are invisible to the outer DOM; splice their content in.
		const iframes = Array.from(document.querySelectorAll('iframe'))
		for (const iframe of iframes) {
			try {
				const innerBody = iframe.contentDocument?.body
				if (!innerBody) continue
				const section = document.createElement('section')
				for (const child of Array.from(innerBody.childNodes)) cloneWithShadow(child, section)
				clone.appendChild(section)
			} catch {
				// Cross-origin frame; nothing we can do without host permission.
			}
		}

		// Remove non-content elements before walking attributes.
		const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT)
		const doomed: Element[] = []
		let current = walker.nextNode()
		while (current) {
			const element = current as Element
			const tag = element.tagName.toLowerCase()
			if (REMOVE_TAGS_SET.has(tag)) {
				doomed.push(element)
			} else {
				for (const attribute of Array.from(element.attributes)) {
					const name = attribute.name.toLowerCase()
					if (KEEP_ATTRIBUTES.has(name)) continue
					if (name === 'class' && KEEP_CLASS_TAGS.has(element.tagName)) continue
					element.removeAttribute(attribute.name)
				}
			}
			current = walker.nextNode()
		}
		for (const element of doomed) element.remove()

		// Drop empty containers left behind. Repeat because removing a child can empty a parent.
		let changed = true
		while (changed) {
			changed = false
			const elements = Array.from(clone.querySelectorAll('*'))
			for (const element of elements) {
				if (element.children.length > 0) continue
				if ((element.textContent ?? '').trim() !== '') continue
				if (['img', 'br', 'hr', 'td', 'th', 'li'].includes(element.tagName.toLowerCase())) continue
				element.remove()
				changed = true
			}
		}

		let html = clone.innerHTML
		let truncated = false
		if (html.length > maxHtmlChars) {
			html = html.slice(0, maxHtmlChars)
			truncated = true
		}

		const text = (body.innerText ?? '').slice(0, 400_000)

		return { ...metadata, html, text, truncated }
	} catch (error) {
		return {
			...empty,
			error: error instanceof Error ? error.message : String(error),
		}
	}
}
