// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { Markdown } from './Markdown'

afterEach(cleanup)

function renderMarkdown(text: string, props: { streaming?: boolean; math?: boolean } = {}) {
	const { container } = render(<Markdown text={text} {...props} />)
	const root = container.querySelector('.markdown')
	if (!root) throw new Error('markdown root missing')
	return root
}

describe('Markdown', () => {
	it('renders GitHub-flavoured markdown', () => {
		const root = renderMarkdown(
			'# Title\n\n| Plan | Price |\n| --- | ---: |\n| Starter | 10 |\n\n- [x] done\n- [ ] todo',
		)
		expect(root.querySelector('h1')?.textContent).toBe('Title')
		expect(root.querySelector('table th')?.textContent).toBe('Plan')
		expect(root.querySelectorAll('input[type="checkbox"]')).toHaveLength(2)
	})

	it('keeps raw HTML inert', () => {
		const root = renderMarkdown('<script>alert(1)</script>\n\nHello')
		expect(root.querySelector('script')).toBeNull()
		expect(root.textContent).toContain('<script>alert(1)</script>')
	})

	it('opens links in a new tab without handing over the opener', () => {
		const link = renderMarkdown('[Example](https://example.com)').querySelector('a')
		expect(link?.getAttribute('target')).toBe('_blank')
		expect(link?.getAttribute('rel')).toContain('noreferrer')
	})

	it('leaves math as text when the math plugin is off', () => {
		const root = renderMarkdown('$$E = mc^2$$', { math: false })
		expect(root.querySelector('.katex')).toBeNull()
		expect(root.textContent).toContain('$$E = mc^2$$')
	})

	it('typesets math once the plugin has loaded', async () => {
		const root = renderMarkdown('The energy is $$E = mc^2$$ exactly.')
		await waitFor(() => expect(root.querySelector('.katex')).not.toBeNull())
		expect(root.textContent).not.toContain('$$')
	})

	it('renders an unterminated fence while streaming', () => {
		const root = renderMarkdown('```js\nconst answer = 42', { streaming: true })
		expect(root.querySelector('[data-streamdown="code-block"]')).not.toBeNull()
		expect(root.textContent).toContain('const answer = 42')
		expect(root.textContent).not.toContain('```')
	})
})
