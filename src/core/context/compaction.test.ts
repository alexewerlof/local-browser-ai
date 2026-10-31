import { describe, expect, it } from 'vitest'
import { buildSummaryPrompt, microCompact, planCompaction } from './compaction'
import type { ChatMessage } from '../types'

function message(id: string, role: 'user' | 'assistant', text: string, parts?: ChatMessage['parts']): ChatMessage {
	return {
		id,
		role,
		parts: parts ?? [{ type: 'text', text }],
		createdAt: Number(id.replace(/\D/g, '')) || 0,
		status: 'complete',
	}
}

const conversation: ChatMessage[] = [
	message('1', 'user', 'What is the pricing?'),
	message('2', 'assistant', 'Starter is 10 EUR.'),
	message('3', 'user', 'And for teams?'),
	message('4', 'assistant', 'Teams is 25 EUR.'),
	message('5', 'user', 'Any discounts?'),
	message('6', 'assistant', 'Annual billing saves 20%.'),
]

describe('planCompaction', () => {
	it('keeps the most recent turns and summarizes the rest', () => {
		const plan = planCompaction(conversation, 2)
		expect(plan).not.toBeNull()
		// Two turns = the two most recent user messages, plus their answers.
		expect(plan?.keep.map((entry) => entry.id)).toEqual(['3', '4', '5', '6'])
		expect(plan?.throughMessageId).toBe('2')
	})

	it('does nothing when there are not enough turns', () => {
		expect(planCompaction(conversation, 3)).toBeNull()
	})

	it('never summarizes everything', () => {
		const plan = planCompaction(conversation, 1)
		expect(plan?.keep.length).toBeGreaterThan(0)
		expect(plan?.throughMessageId).toBe('4')
	})
})

describe('microCompact', () => {
	it('drops reasoning from older turns but keeps the latest', () => {
		const messages: ChatMessage[] = [
			message('1', 'user', 'one'),
			message('2', 'assistant', '', [
				{ type: 'reasoning', text: 'old thinking' },
				{ type: 'text', text: 'a' },
			]),
			message('3', 'user', 'two'),
			message('4', 'assistant', '', [
				{ type: 'reasoning', text: 'new thinking' },
				{ type: 'text', text: 'b' },
			]),
		]
		const { messages: compacted, savedTokens } = microCompact(messages)
		expect(compacted[1]?.parts.some((part) => part.type === 'reasoning')).toBe(false)
		expect(compacted[3]?.parts.some((part) => part.type === 'reasoning')).toBe(true)
		expect(savedTokens).toBeGreaterThan(0)
	})

	it('truncates large old tool output', () => {
		const messages: ChatMessage[] = [
			message('1', 'user', 'find it'),
			message('2', 'assistant', '', [
				{
					type: 'tool-call',
					toolCallId: 'call',
					toolName: 'find_in_page',
					input: {},
					state: 'complete',
					output: 'x'.repeat(2000),
				},
			]),
			message('3', 'user', 'thanks'),
			message('4', 'assistant', 'done'),
			message('5', 'user', 'next'),
		]
		const { messages: compacted } = microCompact(messages)
		const part = compacted[1]?.parts[0]
		expect(part?.type).toBe('tool-call')
		if (part?.type === 'tool-call') {
			expect(String(part.output).length).toBeLessThan(700)
		}
	})
})

describe('buildSummaryPrompt', () => {
	it('includes the transcript and the preservation rules', () => {
		const prompt = buildSummaryPrompt(conversation.slice(0, 4))
		expect(prompt).toContain('What is the pricing?')
		expect(prompt).toContain('Preserve')
		expect(prompt).toContain('USER:')
	})

	it('merges an earlier summary', () => {
		const prompt = buildSummaryPrompt(conversation.slice(0, 2), 'Earlier: pricing talk.')
		expect(prompt).toContain('Earlier: pricing talk.')
	})
})
