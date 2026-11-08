import { describe, expect, it } from 'vitest'
import { countSteps, describeSteps, isStepPart, stepParts } from './steps'
import type { ChatMessage, MessagePart, ToolCallPart } from './types'

function tool(toolCallId: string): ToolCallPart {
	return { type: 'tool-call', toolCallId, toolName: 'read_page', input: {}, state: 'complete' }
}

function message(parts: MessagePart[], extra: Partial<ChatMessage> = {}): ChatMessage {
	return { id: 'm1', role: 'assistant', parts, createdAt: 0, status: 'complete', ...extra }
}

describe('isStepPart', () => {
	it('counts reasoning and tool calls as steps, and text as the answer', () => {
		expect(isStepPart({ type: 'reasoning', text: '…' })).toBe(true)
		expect(isStepPart(tool('call_1'))).toBe(true)
		expect(isStepPart({ type: 'text', text: 'Answer' })).toBe(false)
		expect(isStepPart({ type: 'error', kind: 'unknown', message: 'nope', retryable: false })).toBe(false)
		expect(isStepPart({ type: 'page-ref', pageId: 'p1' })).toBe(false)
	})
})

describe('stepParts', () => {
	it('keeps transcript order and drops the answer', () => {
		const parts: MessagePart[] = [
			{ type: 'reasoning', text: 'Thinking' },
			tool('call_1'),
			{ type: 'text', text: 'Answer' },
		]
		expect(stepParts(parts).map((part) => part.type)).toEqual(['reasoning', 'tool-call'])
	})

	it('is empty for an answer with no steps', () => {
		expect(stepParts([{ type: 'text', text: 'Answer' }])).toEqual([])
	})
})

describe('countSteps', () => {
	it('uses the count the run recorded', () => {
		// The run knows: the transcript cannot tell 2 tools in one step from 2 single-tool
		// steps, so a stored count always wins.
		expect(countSteps(message([tool('call_1'), tool('call_2')], { steps: 2 }))).toBe(2)
		expect(countSteps(message([tool('call_1'), tool('call_2')], { steps: 1 }))).toBe(1)
	})

	it('falls back to the tool-call runs of an answer saved before the count existed', () => {
		expect(countSteps(message([{ type: 'reasoning', text: 'Think' }]))).toBe(1)
		expect(countSteps(message([tool('call_1'), tool('call_2')]))).toBe(1)
		expect(countSteps(message([tool('call_1'), { type: 'text', text: 'A' }, tool('call_2')]))).toBe(2)
		expect(countSteps(message([tool('call_1'), { type: 'reasoning', text: 'Think' }, tool('call_2')]))).toBe(2)
	})

	it('is zero when there is nothing to group', () => {
		expect(countSteps(message([]))).toBe(0)
		expect(countSteps(message([{ type: 'text', text: 'Answer' }]))).toBe(0)
	})
})

describe('describeSteps', () => {
	it('names the steps, the time and the tokens', () => {
		const answer = message([tool('call_1')], {
			steps: 3,
			durationMs: 12_400,
			usage: { inputTokens: 900, outputTokens: 1234, exact: false },
		})
		expect(describeSteps(answer)).toBe('Completed 3 steps in 12.4 s · ~1.2k tokens')
	})

	it('drops a segment it does not know instead of printing a zero', () => {
		expect(describeSteps(message([tool('call_1')], { steps: 1 }))).toBe('Completed 1 step')
		expect(describeSteps(message([tool('call_1')], { steps: 2, durationMs: 900 }))).toBe(
			'Completed 2 steps in 900 ms',
		)
	})
})
