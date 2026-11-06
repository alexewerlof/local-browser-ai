import { describe, expect, it } from 'vitest'
import { buildContext, messagesAfterSummary, messageText, pagesForPrompt, toModelMessages } from './assembly'
import { createBudget } from './tokens'
import type { AppSettings, ChatMessage, Conversation, MemoryItem, PageSnapshot } from '../types'
import { defaultSettings } from '../settings'

const budget = createBudget(20_000, 0.2, 0.75)

function page(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
	return {
		id: 'page1',
		conversationId: 'chat',
		handle: 'p1',
		url: 'https://example.com/pricing',
		title: 'Example Pricing',
		markdown: '# Pricing\n\nStarter is 10 EUR.',
		outline: [
			{ id: 'h0', level: 1, text: 'Pricing', line: 0 },
			{ id: 'h1', level: 2, text: 'Teams', line: 3 },
		],
		chunks: [{ id: 'c1', heading: 'Teams', text: 'Teams costs 25 EUR.', line: 3 }],
		capturedAt: 0,
		truncated: false,
		totalChars: 34,
		block: '## Page p1 — Example Pricing\nURL: https://example.com/pricing\nOutline: …',
		...overrides,
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
		summary: null,
		contextTokens: 0,
		...overrides,
	}
}

function userMessage(id: string, text: string, pages: PageSnapshot[] = []): ChatMessage {
	return {
		id,
		role: 'user',
		parts: [...pages.map((entry) => ({ type: 'page-ref' as const, pageId: entry.id })), { type: 'text', text }],
		createdAt: 0,
		status: 'complete',
	}
}

function assistantMessage(id: string, text: string): ChatMessage {
	return {
		id,
		role: 'assistant',
		parts: text ? [{ type: 'text', text }] : [],
		createdAt: 0,
		status: 'complete',
	}
}

describe('buildContext', () => {
	it('keeps page text out of the system prompt', () => {
		const context = buildContext({
			conversation: conversation(),
			settings: defaultSettings(),
			budget,
			pages: [page()],
			query: 'price',
			toolsEnabled: true,
		})
		expect(context.system).not.toContain('Starter is 10 EUR.')
		expect(context.system).not.toContain('## Page p1')
	})

	it('counts the page blocks as their own context part', () => {
		const entry = page()
		const context = buildContext({
			conversation: conversation({ messages: [userMessage('m1', 'compare', [entry])] }),
			settings: defaultSettings(),
			budget,
			pages: [entry],
			query: 'compare',
			toolsEnabled: true,
		})
		const part = context.parts.find((entry) => entry.id === 'page')
		expect(part?.label).toBe('Example Pricing')
		expect(part?.tokens).toBeGreaterThan(0)
	})

	it('labels several pages by their count', () => {
		const second = page({ id: 'page2', handle: 'p2', title: 'Other shop', block: 'BLOCK 2' })
		const context = buildContext({
			conversation: conversation({ messages: [userMessage('m1', 'compare', [page(), second])] }),
			settings: defaultSettings(),
			budget,
			pages: [page(), second],
			query: 'compare',
			toolsEnabled: true,
		})
		expect(context.parts.find((entry) => entry.id === 'page')?.label).toBe('2 pages')
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
			settings: defaultSettings(),
			budget,
			pages: [],
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
				settings: defaultSettings(),
				budget,
				pages: [],
				query: '',
				// Even a model without tools has to know which language to answer in.
				toolsEnabled: false,
			})
			expect(context.system).toContain('fr-FR')
			expect(context.parts.find((entry) => entry.id === 'environment')?.tokens).toBeGreaterThan(0)
		} finally {
			Object.defineProperty(navigator, 'languages', { value: original, configurable: true })
		}
	})

	it('mentions the language of an added page', () => {
		const german = page({ lang: 'de-DE' })
		const context = buildContext({
			conversation: conversation({ messages: [userMessage('m1', 'was steht hier', [german])] }),
			settings: defaultSettings(),
			budget,
			pages: [german],
			query: '',
			toolsEnabled: true,
		})
		expect(context.system).toContain('"de-DE"')
	})

	it('warns that MCP tool output is untrusted, and only when tools are available', () => {
		const withMcp = buildContext({
			conversation: conversation(),
			settings: defaultSettings(),
			budget,
			pages: [],
			query: '',
			toolsEnabled: true,
			mcpServers: ['Local tools'],
		})
		expect(withMcp.system).toContain('## MCP tools')
		expect(withMcp.system).toContain('Local tools')
		expect(withMcp.system).toContain('untrusted data')
		expect(withMcp.parts.find((part) => part.id === 'mcp')?.tokens).toBeGreaterThan(0)

		const withoutTools = buildContext({
			conversation: conversation(),
			settings: defaultSettings(),
			budget,
			pages: [],
			query: '',
			toolsEnabled: false,
			mcpServers: ['Local tools'],
		})
		expect(withoutTools.system).not.toContain('## MCP tools')
		expect(withoutTools.parts.some((part) => part.id === 'mcp')).toBe(false)
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
		expect(toModelMessages(conversation({ messages }))).toEqual([
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

	it('puts a page block in front of the turn that introduced it', () => {
		const entry = page()
		const messages = [userMessage('m1', 'what does it cost', [entry]), assistantMessage('m2', 'answered')]
		const result = toModelMessages(conversation({ messages }), [entry])
		expect(result[0]).toEqual({ role: 'user', content: `${entry.block}\n\nwhat does it cost` })
		expect(result[1]).toEqual({ role: 'assistant', content: 'answered' })
	})

	it('includes each page block exactly once', () => {
		const entry = page()
		const messages = [
			userMessage('m1', 'compare', [entry]),
			assistantMessage('m2', 'ok'),
			userMessage('m3', 'and now?', [entry]),
		]
		const result = toModelMessages(conversation({ messages }), [entry])
		expect(JSON.stringify(result).match(/## Page p1/g)?.length).toBe(1)
	})

	it('keeps earlier turns byte-identical when a page is added later', () => {
		const first = page()
		const second = page({ id: 'page2', handle: 'p2', title: 'Other shop', block: 'BLOCK p2' })
		const before = [userMessage('m1', 'first question', [first]), assistantMessage('m2', 'first answer')]
		const after = [...before, userMessage('m3', 'compare with this one', [second]), assistantMessage('m4', 'ack')]

		const earlier = toModelMessages(conversation({ messages: before }), [first])
		const longer = toModelMessages(conversation({ messages: after }), [first, second])

		expect(longer.slice(0, earlier.length)).toEqual(earlier)
	})

	it('replays tool calls together with their results', () => {
		const messages: ChatMessage[] = [
			userMessage('m1', 'read the pricing section'),
			{
				id: 'm2',
				role: 'assistant',
				parts: [
					{ type: 'text', text: 'Looking it up.' },
					{
						type: 'tool-call',
						toolCallId: 'call_1',
						toolName: 'read_page_section',
						input: { heading: 'Teams' },
						state: 'complete',
						output: { text: 'Teams costs 25 EUR per seat.' },
					},
				],
				createdAt: 0,
				status: 'complete',
			},
			assistantMessage('m3', 'It costs 25 EUR.'),
		]

		expect(toModelMessages(conversation({ messages }))).toEqual([
			{ role: 'user', content: 'read the pricing section' },
			{
				role: 'assistant',
				content: [
					{ type: 'text', text: 'Looking it up.' },
					{
						type: 'tool-call',
						toolCallId: 'call_1',
						toolName: 'read_page_section',
						input: { heading: 'Teams' },
					},
				],
			},
			{
				role: 'tool',
				content: [
					{
						type: 'tool-result',
						toolCallId: 'call_1',
						toolName: 'read_page_section',
						output: { type: 'json', value: { text: 'Teams costs 25 EUR per seat.' } },
					},
				],
			},
			{ role: 'assistant', content: 'It costs 25 EUR.' },
		])
	})

	it('replays a failed tool call as an error result', () => {
		const messages: ChatMessage[] = [
			userMessage('m1', 'read it'),
			{
				id: 'm2',
				role: 'assistant',
				parts: [
					{
						type: 'tool-call',
						toolCallId: 'call_1',
						toolName: 'read_page_section',
						input: { heading: 'Nope' },
						state: 'error',
						error: 'No section matching "Nope".',
					},
				],
				createdAt: 0,
				status: 'complete',
			},
		]
		const [, assistant, tool] = toModelMessages(conversation({ messages }))
		expect(assistant).toMatchObject({ role: 'assistant' })
		expect(tool).toEqual({
			role: 'tool',
			content: [
				{
					type: 'tool-result',
					toolCallId: 'call_1',
					toolName: 'read_page_section',
					output: { type: 'error-text', value: 'No section matching "Nope".' },
				},
			],
		})
	})

	it('drops a tool call that never finished, so no call is left dangling', () => {
		const messages: ChatMessage[] = [
			userMessage('m1', 'read it'),
			{
				id: 'm2',
				role: 'assistant',
				parts: [
					{ type: 'text', text: 'Reading.' },
					{ type: 'tool-call', toolCallId: 'call_1', toolName: 'find_in_page', input: {}, state: 'running' },
				],
				createdAt: 0,
				status: 'aborted',
			},
		]
		expect(toModelMessages(conversation({ messages }))).toEqual([
			{ role: 'user', content: 'read it' },
			{ role: 'assistant', content: 'Reading.' },
		])
	})
})

describe('pagesForPrompt', () => {
	it('lists the pages whose blocks are in the prompt, once each', () => {
		const first = page()
		const second = page({ id: 'page2', handle: 'p2', block: 'BLOCK p2' })
		const pending = page({ id: 'page3', handle: 'p3', block: 'BLOCK p3' })
		const messages = [userMessage('m1', 'a', [first, second]), assistantMessage('m2', 'b')]

		const included = pagesForPrompt(conversation({ messages }), [first, second, pending])
		expect(included.map((entry) => entry.handle)).toEqual(['p1', 'p2'])
	})

	it('leaves out a page that is only waiting for the next turn', () => {
		const waiting = page()
		expect(pagesForPrompt(conversation({ messages: [userMessage('m1', 'hi')] }), [waiting])).toEqual([])
	})

	it('moves the blocks of summarized pages into the system prompt', () => {
		const entry = page({ messageId: 'm1' })
		const messages = [userMessage('m1', 'first', [entry]), assistantMessage('m2', 'ok'), userMessage('m3', 'later')]
		const context = buildContext({
			conversation: conversation({
				messages,
				summary: { text: 'They asked about pricing.', throughMessageId: 'm2', createdAt: 0, tokenEstimate: 5 },
			}),
			settings: defaultSettings(),
			budget,
			pages: [entry],
			query: '',
			toolsEnabled: true,
		})

		expect(context.system).toContain('Pages from earlier in this conversation')
		expect(context.system).toContain('## Page p1')
		// The summarized turn is gone, so the block must not be sent a second time.
		expect(JSON.stringify(context.messages)).not.toContain('## Page p1')
		// The meter still counts the page.
		expect(context.parts.find((part) => part.id === 'page')?.tokens).toBeGreaterThan(0)
	})
})

describe('messageText', () => {
	it('joins text parts and ignores everything else', () => {
		expect(
			messageText({
				id: 'm1',
				role: 'user',
				parts: [
					{ type: 'page-ref', pageId: 'page1' },
					{ type: 'text', text: 'hello' },
					{ type: 'reasoning', text: 'hidden' },
				],
				createdAt: 0,
				status: 'complete',
			}),
		).toBe('hello')
	})
})

describe('buildContext memory', () => {
	const memory = (overrides: Partial<MemoryItem> = {}): MemoryItem => ({
		id: 'memory_1',
		title: 'Editor',
		text: 'Prefers tabs and no semicolons.',
		mode: 'always',
		scope: 'global',
		createdAt: 1,
		updatedAt: 1,
		...overrides,
	})

	it('adds memory as its own part after the language note', () => {
		const context = buildContext({
			conversation: conversation(),
			settings: defaultSettings(),
			budget,
			pages: [],
			query: 'format my code',
			toolsEnabled: true,
			memories: [memory()],
			memoryToolsEnabled: true,
		})

		const ids = context.parts.map((part) => part.id)
		expect(ids.indexOf('memory')).toBeGreaterThan(ids.indexOf('environment'))
		expect(context.system).toContain('## Memory')
		expect(context.system).toContain('Prefers tabs and no semicolons.')
		// The user's system prompt still leads, so memory is additive.
		expect(context.system.startsWith(defaultSettings().systemPrompt)).toBe(true)

		const part = context.parts.find((entry) => entry.id === 'memory')
		expect(part?.label).toBe('Memory')
		expect(part?.tokens).toBeGreaterThan(0)
		expect(part?.detail).toContain('1 always')
	})

	it('is absent when memory is disabled', () => {
		const base: AppSettings = defaultSettings()
		const context = buildContext({
			conversation: conversation(),
			settings: { ...base, memory: { ...base.memory, enabled: false } },
			budget,
			pages: [],
			query: 'format my code',
			toolsEnabled: true,
			memories: [memory()],
			memoryToolsEnabled: false,
		})
		expect(context.system).not.toContain('Prefers tabs and no semicolons.')
		expect(context.parts.some((part) => part.id === 'memory')).toBe(false)
	})
})
