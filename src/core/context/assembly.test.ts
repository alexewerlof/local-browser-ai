import { describe, expect, it } from 'vitest'
import { buildContext, messagesAfterSummary, toModelMessages, truncateToTokens } from './assembly'
import { createBudget } from './tokens'
import type { AppSettings, ChatMessage, Conversation, PageAttachment } from '../types'
import { defaultSettings } from '../settings'

const budget = createBudget(20_000, 0.2, 0.75)

function attachment(markdown: string): PageAttachment {
	return {
		id: 'page',
		url: 'https://example.com/pricing',
		title: 'Example Pricing',
		markdown,
		outline: [
			{ id: 'h0', level: 1, text: 'Pricing', line: 0 },
			{ id: 'h1', level: 2, text: 'Teams', line: 3 },
		],
		chunks: [
			{ id: 'c1', heading: 'Pricing', text: 'Starter costs 10 EUR per month.', line: 0 },
			{ id: 'c2', heading: 'Teams', text: 'Teams costs 25 EUR per seat and includes audit logs.', line: 3 },
		],
		capturedAt: 0,
		stale: false,
		truncated: false,
		totalChars: markdown.length,
	}
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
	return {
		id: 'chat',
		title: 'Test',
		createdAt: 0,
		updatedAt: 0,
		model: { providerId: 'local', modelId: 'fake-model' },
		messages: [],
		attachments: [],
		summary: null,
		contextTokens: 0,
		...overrides,
	}
}

function settings(overrides: Partial<AppSettings['context']> = {}): AppSettings {
	const base = defaultSettings()
	return { ...base, context: { ...base.context, pageContext: 'auto', strategy: 'index', ...overrides } }
}

describe('buildContext', () => {
	it('omits the page when page context is disabled', () => {
		const context = buildContext({
			conversation: conversation({ attachments: [attachment('# Pricing\n\nStarter is 10 EUR.')] }),
			settings: settings({ pageContext: 'never' }),
			budget,
			query: 'price',
			toolsEnabled: true,
		})
		expect(context.pageMode).toBe('none')
		expect(context.system).not.toContain('Starter is 10 EUR.')
	})

	it('includes the whole page when it fits', () => {
		const context = buildContext({
			conversation: conversation({ attachments: [attachment('# Pricing\n\nStarter is 10 EUR.')] }),
			settings: settings({ pageContext: 'always' }),
			budget,
			query: 'price',
			toolsEnabled: true,
		})
		expect(context.pageMode).toBe('full')
		expect(context.system).toContain('Starter is 10 EUR.')
		expect(context.system).toContain('Example Pricing')
		expect(context.system).toContain('untrusted data')
	})

	it('switches to an index when a page is too large for the window', () => {
		const huge = `# Pricing\n\n${'A long paragraph about pricing. '.repeat(4000)}`
		const context = buildContext({
			conversation: conversation({ attachments: [attachment(huge)] }),
			settings: settings(),
			budget,
			query: 'teams audit logs',
			toolsEnabled: true,
		})
		expect(context.pageMode).toBe('index')
		expect(context.system).toContain('Outline')
		expect(context.system).toContain('read_page_section')
		// Only a short lead-in survives, not the 4000-repeat body.
		const repeats = (context.system.match(/A long paragraph about pricing\./g) ?? []).length
		expect(repeats).toBeLessThan(100)
		// The index is a fraction of the page it describes.
		expect(context.system.length).toBeLessThan(huge.length / 4)
	})

	it('sends the whole page when the strategy asks for it, even if large', () => {
		const context = buildContext({
			conversation: conversation({ attachments: [attachment('# Pricing\n\nStarter is 10 EUR.')] }),
			settings: settings({ strategy: 'full' }),
			budget,
			query: '',
			toolsEnabled: true,
		})
		expect(context.pageMode).toBe('full')
		expect(context.system).toContain('Starter is 10 EUR.')
	})

	it('keeps the whole page for the tiered strategy when it fits', () => {
		const context = buildContext({
			conversation: conversation({ attachments: [attachment('# Pricing\n\nStarter is 10 EUR.')] }),
			settings: settings({ strategy: 'tiered' }),
			budget,
			query: '',
			toolsEnabled: true,
		})
		expect(context.pageMode).toBe('full')
	})

	it('falls back to excerpts when the model has no page tools', () => {
		const huge = `# Pricing\n\n${'A long paragraph about pricing. '.repeat(4000)}\n\n## Teams\n\nAudit logs are included.`
		const context = buildContext({
			conversation: conversation({ attachments: [attachment(huge)] }),
			settings: settings(),
			budget,
			query: 'teams audit logs',
			toolsEnabled: false,
		})
		expect(context.pageMode).toBe('excerpts')
		expect(context.system).toContain('Excerpts most relevant')
		expect(context.pageTruncated).toBe(true)
	})

	it('never exceeds the page share, whatever the strategy', () => {
		const huge = `# Pricing\n\n${'- a heading-like line\n'.repeat(3000)}`
		const context = buildContext({
			conversation: conversation({ attachments: [attachment(huge)] }),
			settings: settings({ strategy: 'full', pageShare: 0.1 }),
			budget,
			query: '',
			toolsEnabled: true,
		})
		const page = context.parts.find((part) => part.id === 'page')
		expect(page?.tokens).toBeLessThanOrEqual(Math.round(budget.usable * 0.1) + 200)
		expect(context.pageTruncated).toBe(true)
	})

	it('adds the conversation summary as system context', () => {
		const context = buildContext({
			conversation: conversation({
				summary: {
					text: 'The user is comparing plans.',
					throughMessageId: 'm1',
					createdAt: 0,
					tokenEstimate: 10,
				},
			}),
			settings: settings(),
			budget,
			query: '',
			toolsEnabled: false,
		})
		expect(context.system).toContain('Summary of earlier conversation')
		expect(context.system).toContain('comparing plans')
	})

	it('puts the language preferences in the prompt, not behind a tool', () => {
		const original = navigator.languages
		Object.defineProperty(navigator, 'languages', { value: ['fr-FR'], configurable: true })
		try {
			const context = buildContext({
				conversation: conversation(),
				settings: settings(),
				budget,
				query: '',
				// Even a model without tools has to know which language to answer in.
				toolsEnabled: false,
			})
			expect(context.system).toContain('fr-FR')
			const part = context.parts.find((entry) => entry.id === 'environment')
			expect(part?.tokens).toBeGreaterThan(0)
		} finally {
			Object.defineProperty(navigator, 'languages', { value: original, configurable: true })
		}
	})

	it('mentions the language of the attached page', () => {
		const context = buildContext({
			conversation: conversation({ attachments: [{ ...attachment('# Preise'), lang: 'de-DE' }] }),
			settings: settings(),
			budget,
			query: '',
			toolsEnabled: true,
		})
		expect(context.system).toContain('"de-DE"')
	})

	it('warns that MCP tool output is untrusted, and only when tools are available', () => {
		const withMcp = buildContext({
			conversation: conversation(),
			settings: settings(),
			budget,
			query: '',
			toolsEnabled: true,
			mcpServers: ['Local tools'],
		})
		expect(withMcp.system).toContain('Local tools')
		expect(withMcp.system).toContain('untrusted data')
		expect(withMcp.parts.find((part) => part.id === 'mcp')?.tokens).toBeGreaterThan(0)

		const withoutTools = buildContext({
			conversation: conversation(),
			settings: settings(),
			budget,
			query: '',
			toolsEnabled: false,
			mcpServers: ['Local tools'],
		})
		expect(withoutTools.system).not.toContain('Remote tools')
		expect(withoutTools.parts.some((part) => part.id === 'mcp')).toBe(false)
	})
})

describe('truncateToTokens', () => {
	it('leaves short text alone', () => {
		expect(truncateToTokens('short', 100)).toEqual({ text: 'short', truncated: false })
	})

	it('cuts at a heading boundary and marks the truncation', () => {
		const text = `# One\n\n${'a '.repeat(2000)}\n# Two\n\n${'b '.repeat(2000)}`
		const result = truncateToTokens(text, 200)
		expect(result.truncated).toBe(true)
		expect(result.text).toContain('Page truncated')
		expect(result.text).not.toContain('bbbb')
	})
})

describe('messagesAfterSummary', () => {
	const messages: ChatMessage[] = [
		{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'one' }], createdAt: 1, status: 'complete' },
		{ id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'two' }], createdAt: 2, status: 'complete' },
		{ id: 'm3', role: 'user', parts: [{ type: 'text', text: 'three' }], createdAt: 3, status: 'complete' },
	]

	it('returns everything without a summary', () => {
		expect(messagesAfterSummary(conversation({ messages }))).toHaveLength(3)
	})

	it('starts after the summarized message', () => {
		const result = messagesAfterSummary(
			conversation({
				messages,
				summary: { text: 'x', throughMessageId: 'm2', createdAt: 0, tokenEstimate: 1 },
			}),
		)
		expect(result.map((entry) => entry.id)).toEqual(['m3'])
	})
})

describe('toModelMessages', () => {
	it('flattens text parts and keeps roles', () => {
		const messages: ChatMessage[] = [
			{
				id: 'm1',
				role: 'user',
				parts: [
					{ type: 'text', text: 'first' },
					{ type: 'text', text: 'second' },
				],
				createdAt: 1,
				status: 'complete',
			},
			{
				id: 'm2',
				role: 'assistant',
				parts: [
					{ type: 'reasoning', text: 'thinking' },
					{ type: 'text', text: 'answer' },
				],
				createdAt: 2,
				status: 'complete',
			},
		]
		const result = toModelMessages(conversation({ messages }))
		expect(result).toEqual([
			{ role: 'user', content: 'first\n\nsecond' },
			{ role: 'assistant', content: 'answer' },
		])
	})

	it('skips messages without text', () => {
		const messages: ChatMessage[] = [
			{ id: 'm1', role: 'assistant', parts: [], createdAt: 1, status: 'streaming' },
			{ id: 'm2', role: 'user', parts: [{ type: 'text', text: 'hi' }], createdAt: 2, status: 'complete' },
		]
		expect(toModelMessages(conversation({ messages }))).toEqual([{ role: 'user', content: 'hi' }])
	})
})
