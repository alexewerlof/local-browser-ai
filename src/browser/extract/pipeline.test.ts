// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { InjectResult } from './inject'
import { processExtraction } from './pipeline'

function result(overrides: Partial<InjectResult> = {}): InjectResult {
	return {
		url: 'https://example.com/docs/page',
		baseUrl: 'https://example.com/docs/page',
		canonicalUrl: '',
		title: 'Fixture',
		description: '',
		lang: 'en',
		faviconUrl: '',
		byline: '',
		publishedTime: '',
		html: '',
		text: '',
		aria: '',
		controls: 0,
		selection: '',
		truncated: false,
		...overrides,
	}
}

const articleHtml = `
	<article>
		<h1>Pricing</h1>
		${'<p>The Starter plan costs 10 EUR per month and includes one seat. </p>'.repeat(10)}
		<h2>Teams</h2>
		${'<p>The Teams plan adds shared workspaces and audit logs for every seat. </p>'.repeat(10)}
	</article>
`

const appAria = [
	'## Workspace settings',
	'- button "Save changes"',
	'- textbox "Workspace name"',
	'- checkbox "Audit logging" [checked]',
	'- link "Billing" → /billing',
	'- list "Members"',
	'  - Ada Lovelace',
	'  - Grace Hopper',
	'- button "Invite member"',
].join('\n')

describe('processExtraction', () => {
	it('prefers the readable article', () => {
		const attachment = processExtraction(result({ html: articleHtml, aria: appAria, controls: 9 }))
		expect(attachment.representation).toBe('article')
		expect(attachment.markdown).toContain('Starter plan costs 10 EUR')
		expect(attachment.outline.length).toBeGreaterThan(0)
	})

	it('uses the accessibility view for app-shaped pages', () => {
		const attachment = processExtraction(
			result({ html: '<div><main><button>Save</button></main></div>', aria: appAria, controls: 9 }),
		)
		expect(attachment.representation).toBe('app')
		expect(attachment.markdown).toBe(appAria)
	})

	it('does not use the accessibility view for prose pages with few controls', () => {
		const html = `<div>${'<p>A plain paragraph without any heading at all. </p>'.repeat(20)}</div>`
		const attachment = processExtraction(result({ html, aria: appAria, controls: 1 }))
		expect(attachment.representation).not.toBe('app')
		expect(attachment.markdown).toContain('A plain paragraph without any heading')
	})

	it('sections the accessibility view by its headings', () => {
		const attachment = processExtraction(result({ html: '<div></div>', aria: appAria, controls: 9 }))
		expect(attachment.outline.map((entry) => entry.text)).toContain('Workspace settings')
		expect(attachment.chunks.some((chunk) => chunk.text.includes('Audit logging'))).toBe(true)
	})

	it('falls back to the page text when there is nothing else', () => {
		const attachment = processExtraction(result({ html: '', text: 'Short text only.' }))
		expect(attachment.representation).toBe('text')
		expect(attachment.markdown).toBe('Short text only.')
	})

	it('keeps the extraction cap on the attachment', () => {
		const attachment = processExtraction(result({ html: articleHtml, truncated: true }))
		expect(attachment.truncated).toBe(true)
	})
})
