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
	/** Accessibility skeleton of the live page: roles, names, states, headings. */
	aria: string
	/** Visible interactive elements, used to recognise app-shaped pages. */
	controls: number
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
		aria: '',
		controls: 0,
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
		/**
		 * Page chrome that survives the tag filter because it lives in a `<div>`.
		 * Matched on the element's own hints and only removed when it looks like a
		 * banner rather than real content, so an article named "Cookie policy" stays.
		 */
		const BOILERPLATE_HINT =
			/(cookie|consent|gdpr|newsletter|subscribe|signup|breadcrumb|pagination|pager|share|social|related|sponsor|advert|promo|sidebar|site-nav|skip-link|toolbar|masthead)/i
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

		/** Beyond this many images the payload is mostly URLs nobody will read. */
		const MAX_IMAGES = 20
		let imagesCopied = 0

		/**
		 * Page chrome that survives the tag filter because it lives in a `<div>`.
		 * Matched on the element's own hints, and only removed when it looks like a
		 * banner rather than real content, so an article about cookies stays.
		 */
		const isBoilerplate = (element: Element): boolean => {
			const role = element.getAttribute('role')
			if (
				role === 'navigation' ||
				role === 'banner' ||
				role === 'contentinfo' ||
				role === 'complementary' ||
				role === 'search'
			) {
				return true
			}
			const hints = `${element.id} ${element.getAttribute('class') ?? ''} ${element.getAttribute('aria-label') ?? ''}`
			if (!BOILERPLATE_HINT.test(hints)) return false
			// Only drop small, low-structure blocks: a pricing table inside a wrapper
			// called `sidebar-layout` is still content.
			if ((element.textContent ?? '').trim().length > 600) return false
			if (element.querySelectorAll('p, pre, table, h1, h2, h3').length > 3) return false
			return true
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

			// An image without alt text contributes nothing to a text summary: its URL is
			// a token cost with no answer behind it.
			if (element.tagName === 'IMG') {
				const alt = (element.getAttribute('alt') ?? '').trim()
				if (!alt || imagesCopied >= MAX_IMAGES) return
				imagesCopied += 1
			}

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
			if (REMOVE_TAGS_SET.has(tag) || isBoilerplate(element)) {
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

		const text = (body.innerText ?? '').slice(0, 60_000)

		/* --------------------------------------------------------------- aria view */

		/**
		 * A second, much smaller representation: the accessibility skeleton of the
		 * page. Built from the live DOM (not the clone) because role, name and state
		 * come from attributes and inputs the clone drops.
		 *
		 * It is markup-shaped so the section splitter still sees headings: headings
		 * become markdown headings, everything else becomes list lines.
		 */
		const CONTROLS_SELECTOR =
			'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"]'
		let controls = 0
		try {
			controls = document.querySelectorAll(CONTROLS_SELECTOR).length
		} catch {
			controls = 0
		}

		const MAX_ARIA_LINES = 600
		const MAX_ARIA_CHARS = 60_000
		const MAX_NAME_CHARS = 90
		const MAX_TEXT_CHARS = 240

		const flatten = (value: string, limit = MAX_NAME_CHARS): string =>
			value.replace(/\s+/g, ' ').trim().slice(0, limit)

		const impliedRole = (element: Element): string => {
			const tag = element.tagName.toLowerCase()
			if (/^h[1-6]$/.test(tag)) return 'heading'
			switch (tag) {
				case 'a':
					return element.hasAttribute('href') ? 'link' : ''
				case 'button':
				case 'summary':
					return 'button'
				case 'img':
					return (element.getAttribute('alt') ?? '').trim() ? 'image' : ''
				case 'ul':
				case 'ol':
				case 'menu':
					return 'list'
				case 'li':
					return 'listitem'
				case 'table':
					return 'table'
				case 'tr':
					return 'row'
				case 'th':
				case 'td':
					return 'cell'
				case 'caption':
					return 'caption'
				case 'select':
					return 'combobox'
				case 'textarea':
					return 'textbox'
				case 'dialog':
					return 'dialog'
				case 'details':
				case 'fieldset':
					return 'group'
				case 'form':
					return 'form'
				case 'main':
					return 'main'
				case 'article':
					return 'article'
				case 'p':
					return 'paragraph'
				case 'pre':
					return 'code'
				case 'blockquote':
					return 'quote'
				case 'input': {
					const type = (element.getAttribute('type') ?? 'text').toLowerCase()
					const map: Record<string, string> = {
						checkbox: 'checkbox',
						radio: 'radio',
						range: 'slider',
						submit: 'button',
						button: 'button',
						reset: 'button',
						file: 'button',
						color: 'button',
						image: 'button',
						search: 'searchbox',
						number: 'spinbutton',
					}
					return map[type] ?? 'textbox'
				}
				default:
					return ''
			}
		}

		const headingLevel = (element: Element): number => {
			const tag = element.tagName.toLowerCase()
			if (/^h[1-6]$/.test(tag)) return Number(tag.slice(1))
			const level = Number(element.getAttribute('aria-level') ?? '')
			return level >= 1 && level <= 6 ? level : 2
		}

		/** Name from attributes only: never from descendant text, which is emitted separately. */
		const labelOf = (element: Element): string => {
			const labelledBy = element.getAttribute('aria-labelledby')
			if (labelledBy) {
				const parts = labelledBy
					.split(/\s+/)
					.map((id) => document.getElementById(id))
					.filter((node): node is HTMLElement => Boolean(node))
					.map((node) => node.innerText ?? node.textContent ?? '')
					.join(' ')
				const name = flatten(parts)
				if (name) return name
			}
			const ariaLabel = flatten(element.getAttribute('aria-label') ?? '')
			if (ariaLabel) return ariaLabel
			return flatten(element.getAttribute('title') ?? element.getAttribute('placeholder') ?? '')
		}

		const textOf = (element: Element): string =>
			flatten((element as HTMLElement).innerText ?? element.textContent ?? '', MAX_TEXT_CHARS)

		/** Controls are named by their visible text when nothing else is available. */
		const controlName = (element: Element): string => labelOf(element) || textOf(element)

		const stateOf = (element: Element): string => {
			const states: string[] = []
			if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') {
				states.push('disabled')
			}
			const type = (element.getAttribute('type') ?? '').toLowerCase()
			const checked = (element as HTMLInputElement).checked
			if (typeof checked === 'boolean' && (type === 'checkbox' || type === 'radio')) {
				if (checked) states.push('checked')
			} else if (element.getAttribute('aria-checked') === 'true') {
				states.push('checked')
			}
			if (element.getAttribute('aria-expanded') === 'true') states.push('expanded')
			if (element.getAttribute('aria-selected') === 'true') states.push('selected')
			if (element.getAttribute('aria-pressed') === 'true') states.push('pressed')
			return states.length ? ` [${states.join(', ')}]` : ''
		}

		/** Same-origin link target, kept only when it is short enough to be worth it. */
		const shortHref = (element: Element): string => {
			const raw = element.getAttribute('href') ?? ''
			if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) return ''
			try {
				const url = new URL(raw, document.baseURI)
				if (url.origin !== location.origin) return ''
				const path = `${url.pathname}${url.search}`
				return path.length <= 60 ? path : ''
			} catch {
				return ''
			}
		}

		const ariaLines: string[] = []
		let ariaChars = 0

		const emitAria = (line: string, depth: number): void => {
			if (ariaLines.length >= MAX_ARIA_LINES || ariaChars >= MAX_ARIA_CHARS) return
			const rendered = `${'  '.repeat(Math.min(depth, 6))}- ${line}`
			ariaLines.push(rendered)
			ariaChars += rendered.length + 1
			return
		}

		const walkAria = (element: Element, depth: number): void => {
			if (ariaLines.length >= MAX_ARIA_LINES || ariaChars >= MAX_ARIA_CHARS) return
			if (isHidden(element)) return

			const tag = element.tagName.toLowerCase()
			if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template' || tag === 'svg') {
				return
			}

			const walkChildren = (nextDepth: number): void => {
				for (const child of Array.from(element.children)) walkAria(child, nextDepth)
			}

			const explicitRole = (element.getAttribute('role') ?? '').trim().toLowerCase()
			if (explicitRole === 'presentation' || explicitRole === 'none') {
				walkChildren(depth)
				return
			}
			// Page chrome rather than content: the ARIA view is for app surfaces, where a
			// nav *is* content, but the site banner and footer never are.
			if (explicitRole === 'banner' || explicitRole === 'contentinfo') return

			const role = explicitRole || impliedRole(element)

			switch (role) {
				case 'heading': {
					const name = textOf(element)
					if (name) emitAria(`${'#'.repeat(headingLevel(element))} ${name}`, depth)
					return
				}
				case 'link': {
					const name = controlName(element)
					if (!name) {
						walkChildren(depth)
						return
					}
					const href = shortHref(element)
					emitAria(`link "${name}"${href ? ` → ${href}` : ''}`, depth)
					return
				}
				case 'image': {
					const alt = flatten(element.getAttribute('alt') ?? '')
					if (alt) emitAria(`image "${alt}"`, depth)
					return
				}
				case 'button':
				case 'tab':
				case 'menuitem':
				case 'option': {
					const name = controlName(element)
					if (name) emitAria(`${role} "${name}"${stateOf(element)}`, depth)
					return
				}
				case 'textbox':
				case 'searchbox':
				case 'combobox':
				case 'spinbutton':
				case 'checkbox':
				case 'radio':
				case 'slider':
				case 'switch': {
					const name = controlName(element)
					emitAria(`${role}${name ? ` "${name}"` : ''}${stateOf(element)}`, depth)
					return
				}
				case 'list': {
					const name = labelOf(element)
					emitAria(name ? `list "${name}"` : 'list', depth)
					walkChildren(depth + 1)
					return
				}
				case 'listitem': {
					if (element.children.length === 0) {
						const text = textOf(element)
						if (text) emitAria(text, depth + 1)
						return
					}
					walkChildren(depth + 1)
					return
				}
				case 'table':
				case 'row': {
					const name = role === 'table' ? labelOf(element) : ''
					emitAria(name ? `${role} "${name}"` : role, depth)
					walkChildren(depth + 1)
					return
				}
				case 'paragraph':
				case 'quote':
				case 'code':
				case 'cell':
				case 'caption': {
					const text = textOf(element)
					if (text) emitAria(text, depth)
					return
				}
				case 'main':
				case 'article': {
					// These say nothing by themselves and would only add a line.
					walkChildren(depth)
					return
				}
				case 'dialog':
				case 'group':
				case 'form':
				case 'region':
				case 'navigation': {
					const name = labelOf(element)
					if (name) emitAria(`${role} "${name}"`, depth)
					walkChildren(depth + 1)
					return
				}
				default: {
					if (element.children.length === 0) {
						const text = textOf(element)
						if (text) emitAria(text, depth)
						return
					}
					// Unnamed wrappers are transparent: their children stay at this depth.
					walkChildren(depth)
				}
			}
		}

		let aria = ''
		try {
			for (const child of Array.from(body.children)) walkAria(child, 0)
			aria = ariaLines.join('\n')
		} catch {
			aria = ''
		}

		return { ...metadata, html, text, aria, controls, truncated }
	} catch (error) {
		return {
			...empty,
			error: error instanceof Error ? error.message : String(error),
		}
	}
}
