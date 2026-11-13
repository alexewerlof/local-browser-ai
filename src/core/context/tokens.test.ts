import { describe, expect, it } from 'vitest'
import { createBudget, estimateMessageTokens, estimateTokens } from './tokens'
import type { ChatMessage } from '../types'

describe('estimateTokens', () => {
	it('returns zero for empty text', () => {
		expect(estimateTokens('')).toBe(0)
	})

	it('approximates latin prose at four characters per token', () => {
		expect(estimateTokens('a'.repeat(400))).toBe(100)
	})

	it('counts CJK characters as roughly one token each', () => {
		expect(estimateTokens('日本語')).toBe(3)
		expect(estimateTokens('한국어')).toBe(3)
	})

	it('mixes scripts without losing the heavier CJK cost', () => {
		const mixed = estimateTokens('abc 日本')
		expect(mixed).toBe(1 + 2)
	})
})

describe('estimateMessageTokens', () => {
	const message = (parts: ChatMessage['parts']): ChatMessage => ({
		id: 'm1',
		role: 'assistant',
		parts,
		createdAt: 0,
		status: 'complete',
	})

	it('counts text and reasoning', () => {
		const tokens = estimateMessageTokens(
			message([
				{ type: 'text', text: 'a'.repeat(40) },
				{ type: 'reasoning', text: 'b'.repeat(40) },
			]),
		)
		expect(tokens).toBeGreaterThanOrEqual(20)
	})

	it('counts the open tab note, because it is sent with the message', () => {
		const plain = message([{ type: 'text', text: 'what is this?' }])
		const noted: ChatMessage = {
			...plain,
			tab: { title: 'Example Pricing', url: 'https://example.com/pricing' },
		}
		expect(estimateMessageTokens(noted)).toBeGreaterThan(estimateMessageTokens(plain))
	})

	it('counts tool inputs and outputs', () => {
		const withOutput = estimateMessageTokens(
			message([
				{
					type: 'tool-call',
					toolCallId: 't1',
					toolName: 'find_in_page',
					input: { query: 'x'.repeat(40) },
					state: 'complete',
					output: 'y'.repeat(80),
				},
			]),
		)
		const withoutOutput = estimateMessageTokens(
			message([
				{
					type: 'tool-call',
					toolCallId: 't1',
					toolName: 'find_in_page',
					input: { query: 'x'.repeat(40) },
					state: 'running',
				},
			]),
		)
		expect(withOutput).toBeGreaterThan(withoutOutput)
	})
})

describe('createBudget', () => {
	it('reserves part of the window for the answer', () => {
		const budget = createBudget(10_000, 0.2, 0.75)
		expect(budget.outputReserve).toBe(2000)
		expect(budget.usable).toBe(8000)
		expect(budget.compactionAt).toBe(7500)
	})

	it('keeps a usable window even for tiny models', () => {
		const budget = createBudget(100, 0.5, 0.9)
		expect(budget.usable).toBe(512)
	})
})
