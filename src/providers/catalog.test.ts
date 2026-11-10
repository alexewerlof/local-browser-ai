import { describe, expect, it } from 'vitest'
import { getModelInfo, normalizeThinking, thinkingOptions } from './catalog'

describe('getModelInfo', () => {
	it('falls back to local defaults for unknown model ids', () => {
		const info = getModelInfo('some-private-model')
		expect(info.id).toBe('some-private-model')
		expect(info.contextWindow).toBe(8192)
		expect(info.reasoning).toBe(false)
	})

	it('flags local reasoning families', () => {
		expect(getModelInfo('deepseek-r1:8b').reasoning).toBe(true)
	})

	it('labels an empty model id with the generic name', () => {
		const info = getModelInfo('')
		expect(info.label).toBe('Local model')
		expect(info.reasoning).toBe(false)
	})
})

describe('thinkingOptions', () => {
	it('offers only Off for non-reasoning models', () => {
		const info = getModelInfo('llama3:8b')
		expect(thinkingOptions(info).map((option) => option.value)).toEqual(['off'])
	})

	it('offers effort levels for local reasoning models', () => {
		const info = getModelInfo('qwen3:8b')
		expect(thinkingOptions(info).map((option) => option.value)).toContain('high')
	})
})

describe('normalizeThinking', () => {
	it('forces off when the model cannot reason', () => {
		const info = getModelInfo('llama3:8b')
		expect(normalizeThinking({ level: 'high' }, info)).toEqual({ level: 'off' })
	})

	it('keeps a supported level', () => {
		const info = getModelInfo('qwen3:8b')
		expect(normalizeThinking({ level: 'medium' }, info)).toEqual({ level: 'medium' })
	})

	it('falls back to auto for an unknown level', () => {
		const info = getModelInfo('qwen3:8b')
		expect(normalizeThinking({ level: 'custom' } as never, info)).toEqual({ level: 'auto' })
	})
})
