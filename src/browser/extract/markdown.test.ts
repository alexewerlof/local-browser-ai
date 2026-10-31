// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { cleanUrl, htmlToMarkdown } from './markdown'

describe('cleanUrl', () => {
	it('removes tracking parameters and keeps the rest', () => {
		expect(cleanUrl('https://example.com/p?utm_source=x&id=7&fbclid=abc')).toBe('https://example.com/p?id=7')
	})

	it('leaves invalid URLs alone', () => {
		expect(cleanUrl('not a url')).toBe('not a url')
	})
})

describe('htmlToMarkdown', () => {
	it('renders headings, paragraphs and lists', () => {
		const markdown = htmlToMarkdown(
			'<article><h1>Title</h1><p>Intro text.</p><ul><li>One</li><li>Two</li></ul></article>',
		)
		expect(markdown).toContain('# Title')
		expect(markdown).toContain('Intro text.')
		expect(markdown).toContain('- One')
		expect(markdown).toContain('- Two')
	})

	it('keeps the language of fenced code blocks', () => {
		const markdown = htmlToMarkdown('<pre><code class="language-typescript">const x = 1\nconst y = 2</code></pre>')
		expect(markdown).toContain('```typescript')
		expect(markdown).toContain('const x = 1')
		expect(markdown).toContain('const y = 2')
		expect(markdown).toContain('```')
	})

	it('renders inline code without turning it into a block', () => {
		const markdown = htmlToMarkdown('<p>Use <code>npm run build</code> to build.</p>')
		expect(markdown).toContain('`npm run build`')
		expect(markdown).not.toContain('```')
	})

	it('escapes backticks inside inline code', () => {
		const markdown = htmlToMarkdown('<p><code>a `b` c</code></p>')
		expect(markdown).toContain('``a `b` c``')
	})

	it('renders gfm tables', () => {
		const markdown = htmlToMarkdown(
			'<table><thead><tr><th>Plan</th><th>Price</th></tr></thead><tbody><tr><td>Starter</td><td>10</td></tr></tbody></table>',
		)
		expect(markdown).toContain('| Plan | Price |')
		expect(markdown).toContain('| Starter | 10 |')
	})

	it('removes tracking parameters from links', () => {
		const markdown = htmlToMarkdown('<p><a href="https://example.com/x?utm_source=news">Read</a></p>')
		expect(markdown).toBe('[Read](https://example.com/x)')
	})

	it('drops data: images but keeps remote ones', () => {
		const markdown = htmlToMarkdown(
			'<p><img src="data:image/png;base64,AAAA" alt="inline"><img src="https://example.com/a.png" alt="Remote"></p>',
		)
		expect(markdown).not.toContain('data:image')
		expect(markdown).toContain('![Remote](https://example.com/a.png)')
	})

	it('renders figure captions', () => {
		const markdown = htmlToMarkdown(
			'<figure><img src="https://example.com/chart.png" alt="Chart"><figcaption>Revenue by year</figcaption></figure>',
		)
		expect(markdown).toContain('![Chart](https://example.com/chart.png)')
		expect(markdown).toContain('*Revenue by year*')
	})

	it('drops scripts and styles', () => {
		const markdown = htmlToMarkdown('<div><script>alert(1)</script><style>.a{}</style><p>Keep</p></div>')
		expect(markdown).toBe('Keep')
	})

	it('normalises excessive blank lines', () => {
		const markdown = htmlToMarkdown('<p>a</p><div></div><div></div><p>b</p>')
		expect(markdown).toBe('a\n\nb')
	})
})
