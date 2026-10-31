import { describe, expect, it } from 'vitest'
import { getModelInfo, normalizeThinking, thinkingBudget, thinkingOptions } from './catalog'

describe('getModelInfo', () => {
	it('knows Claude models have a large window and reasoning', () => {
		const info = getModelInfo('anthropic', 'claude-sonnet-4-5')
		expect(info.contextWindow).toBe(200_000)
		expect(info.capabilities.reasoning).toBe(true)
	})

	it('recognises OpenAI reasoning models', () => {
		const info = getModelInfo('openai', 'gpt-5')
		expect(info.capabilities.reasoning).toBe(true)
		expect(info.contextWindow).toBeGreaterThanOrEqual(200_000)
	})

	it('falls back to provider defaults for unknown model ids', () => {
		const info = getModelInfo('openai-compatible', 'some-private-model')
		expect(info.contextWindow).toBe(8192)
		expect(info.capabilities.tools).toBe(true)
		expect(info.capabilities.reasoning).toBe(false)
	})

	it('flags local reasoning families', () => {
		expect(getModelInfo('openai-compatible', 'deepseek-r1:8b').capabilities.reasoning).toBe(true)
	})

	it('keeps the built-in model tool-free', () => {
		const info = getModelInfo('prompt-api', 'text')
		expect(info.capabilities.tools).toBe(false)
		expect(info.capabilities.reasoning).toBe(false)
	})
})

describe('thinkingOptions', () => {
	it('offers only Off for non-reasoning models', () => {
		const info = getModelInfo('prompt-api', 'text')
		expect(thinkingOptions('prompt-api', info).map((option) => option.value)).toEqual(['off'])
	})

	it('offers effort levels for OpenAI-style reasoning', () => {
		const info = getModelInfo('openai', 'gpt-5')
		expect(thinkingOptions('openai', info).map((option) => option.value)).toContain('high')
	})
})

describe('thinkingBudget', () => {
	const info = getModelInfo('anthropic', 'claude-sonnet-4-5')

	it('maps low and medium to bounded budgets', () => {
		expect(thinkingBudget({ level: 'low' }, info)).toBe(2048)
		expect(thinkingBudget({ level: 'medium' }, info)).toBe(8192)
	})

	it('never exceeds the model output limit', () => {
		expect(thinkingBudget({ level: 'high' }, info)).toBeLessThanOrEqual(info.maxOutputTokens)
	})

	it('uses an explicit custom budget', () => {
		expect(thinkingBudget({ level: 'custom', tokens: 3000 }, info)).toBe(3000)
	})

	it('returns zero for off', () => {
		expect(thinkingBudget({ level: 'off' }, info)).toBe(0)
	})
})

describe('normalizeThinking', () => {
	it('forces off when the model cannot reason', () => {
		const info = getModelInfo('prompt-api', 'text')
		expect(normalizeThinking({ level: 'high' }, 'prompt-api', info)).toEqual({ level: 'off' })
	})

	it('keeps a supported level', () => {
		const info = getModelInfo('anthropic', 'claude-sonnet-4-5')
		expect(normalizeThinking({ level: 'medium' }, 'anthropic', info)).toEqual({ level: 'medium' })
	})

	it('falls back to auto for unsupported levels', () => {
		const info = getModelInfo('anthropic', 'claude-sonnet-4-5')
		expect(normalizeThinking({ level: 'custom', tokens: 5000 }, 'anthropic', info)).toEqual({ level: 'auto' })
	})
})
