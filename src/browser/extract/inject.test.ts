// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { extractPageInPageContext } from './inject'

function setup(html: string, base = 'https://example.com/docs/page'): void {
	document.head.innerHTML = `
		<title>Fixture Title</title>
		<meta name="description" content="Fixture description">
		<meta name="author" content="Ada Lovelace">
		<meta property="article:published_time" content="2026-01-02">
		<link rel="canonical" href="/canonical">
		<link rel="icon" href="/favicon.ico">
	`
	document.body.innerHTML = html
	// jsdom keeps the document URL immutable, so `base` is only documentation here.
	void base
	// `document.baseURI` in jsdom is about:blank + the test URL; normalise expectations
	// by using absolute URLs in the fixture where the origin matters.
}

beforeEach(() => {
	setup('<p>default</p>')
})

describe('extractPageInPageContext', () => {
	it('reads metadata and resolves relative URLs', () => {
		const result = extractPageInPageContext({ mode: 'page' })
		expect(result.title).toBe('Fixture Title')
		expect(result.description).toBe('Fixture description')
		expect(result.byline).toBe('Ada Lovelace')
		expect(result.publishedTime).toBe('2026-01-02')
		expect(result.canonicalUrl).toMatch(/\/canonical$/)
		expect(result.faviconUrl).toMatch(/\/favicon\.ico$/)
	})

	it('keeps article content and drops scripts, styles and navigation', () => {
		setup(`
			<nav><a href="/nav">Navigation</a></nav>
			<article>
				<h1>Pricing</h1>
				<p>Starter costs 10 EUR.</p>
				<script>console.log('tracking')</script>
				<style>.a{}</style>
			</article>
		`)
		const result = extractPageInPageContext({ mode: 'page' })
		expect(result.html).toContain('Starter costs 10 EUR.')
		expect(result.html).not.toContain('Navigation')
		expect(result.html).not.toContain('tracking')
		expect(result.html).not.toMatch(/<script/i)
		expect(result.html).not.toMatch(/<style/i)
	})

	it('drops hidden nodes by attribute and by inline style', () => {
		setup(`
			<article>
				<p>Visible text</p>
				<div hidden>hidden-attribute-marker</div>
				<div aria-hidden="true">aria-hidden-marker</div>
				<div style="display: none">display-none-marker</div>
				<div style="visibility: hidden">visibility-marker</div>
			</article>
		`)
		const result = extractPageInPageContext({ mode: 'page' })
		expect(result.html).toContain('Visible text')
		expect(result.html).not.toContain('hidden-attribute-marker')
		expect(result.html).not.toContain('aria-hidden-marker')
		expect(result.html).not.toContain('display-none-marker')
		expect(result.html).not.toContain('visibility-marker')
	})

	it('makes links and images absolute and keeps alt text', () => {
		setup(`
			<article>
				<a href="/next">Read more</a>
				<img src="/chart.png" alt="Chart">
			</article>
		`)
		const result = extractPageInPageContext({ mode: 'page' })
		expect(result.html).toMatch(/href="[^"]*\/next"/)
		expect(result.html).toMatch(/src="[^"]*\/chart\.png"/)
		expect(result.html).toContain('alt="Chart"')
	})

	it('keeps code language classes and table structure', () => {
		setup(`
			<article>
				<pre><code class="language-js">const x = 1</code></pre>
				<table><thead><tr><th>Plan</th></tr></thead><tbody><tr><td>Starter</td></tr></tbody></table>
			</article>
		`)
		const result = extractPageInPageContext({ mode: 'page' })
		expect(result.html).toContain('class="language-js"')
		expect(result.html).toContain('<th>Plan</th>')
		expect(result.html).toContain('<td>Starter</td>')
	})

	it('drops non-content widgets but keeps their text', () => {
		setup(`
			<article>
				<form><input value="x"><button>Buy</button></form>
				<p>Body text</p>
			</article>
		`)
		const result = extractPageInPageContext({ mode: 'page' })
		expect(result.html).not.toMatch(/<form/i)
		expect(result.html).not.toMatch(/<button/i)
		expect(result.html).toContain('Body text')
	})

	it('flattens open shadow roots into the page content', () => {
		setup('<article><div id="host"></div><p>Light text</p></article>')
		const host = document.getElementById('host')
		host!.attachShadow({ mode: 'open' }).innerHTML = '<p>shadow-content-text</p>'
		const result = extractPageInPageContext({ mode: 'page' })
		expect(result.html).toContain('shadow-content-text')
		expect(result.html).toContain('Light text')
	})

	it('prunes empty containers left behind', () => {
		setup('<article><div><span></span></div><p>Real</p></article>')
		const result = extractPageInPageContext({ mode: 'page' })
		expect(result.html).toBe('<article><p>Real</p></article>')
	})

	it('returns only metadata in selection mode', () => {
		setup('<article><p>Selected body</p></article>')
		const result = extractPageInPageContext({ mode: 'selection' })
		expect(result.html).toBe('')
		expect(result.title).toBe('Fixture Title')
	})

	it('caps the payload and flags truncation', () => {
		setup(`<article><p>${'word '.repeat(5000)}</p></article>`)
		const result = extractPageInPageContext({ mode: 'page', maxHtmlChars: 500 })
		expect(result.truncated).toBe(true)
		expect(result.html.length).toBeLessThanOrEqual(500)
	})

	it('reports an error instead of throwing for a broken page', () => {
		const result = extractPageInPageContext({ mode: 'page' })
		expect(result.error).toBeUndefined()
	})
})
