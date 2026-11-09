import { describe, expect, it } from 'vitest'
import { DEFAULT_BASE_URLS, buildProviderOptions, normalizeBaseURL } from './registry'
import { getModelInfo } from './catalog'
import { PROVIDER_PRESETS } from './types'
import type { ProviderSettings } from '../core/types'

function provider(overrides: Partial<ProviderSettings>): ProviderSettings {
	return {
		id: 'local',
		kind: 'openai-compatible',
		label: 'Local',
		models: ['llama'],
		...overrides,
	}
}

describe('normalizeBaseURL', () => {
	it('keeps an existing /v1', () => {
		expect(normalizeBaseURL('http://localhost:9931/v1', '')).toBe('http://localhost:9931/v1')
	})

	it('appends /v1 to a bare host', () => {
		expect(normalizeBaseURL('http://localhost:11434', '')).toBe('http://localhost:11434/v1')
	})

	it('strips a chat completions suffix', () => {
		expect(normalizeBaseURL('https://api.example.com/v1/chat/completions', '')).toBe('https://api.example.com/v1')
	})

	it('strips trailing slashes', () => {
		expect(normalizeBaseURL('http://localhost:1234/v1/', '')).toBe('http://localhost:1234/v1')
	})

	it('uses the fallback when empty', () => {
		expect(normalizeBaseURL('', 'https://api.openai.com/v1')).toBe('https://api.openai.com/v1')
	})
})

/**
 * The preset's placeholder URL and the fallback `createLanguageModel` uses are two separate
 * constants for the same endpoint, so they must not drift: llama.cpp's default port has
 * moved before, and a stale one would send every request nowhere.
 */
describe('default base URLs', () => {
	it('keeps every preset in step with DEFAULT_BASE_URLS', () => {
		for (const preset of PROVIDER_PRESETS) {
			const fallback = DEFAULT_BASE_URLS[preset.kind]
			if (!fallback) continue
			expect(preset.defaultBaseURL).toBe(fallback)
		}
	})

	it('points the local server preset at llama.cpp', () => {
		const local = PROVIDER_PRESETS.find((preset) => preset.kind === 'openai-compatible')
		expect(local?.defaultBaseURL).toBe('http://localhost:9931/v1')
	})
})

describe('buildProviderOptions', () => {
	it('returns nothing when reasoning is off', () => {
		const local = provider({})
		expect(
			buildProviderOptions(local, 'llama', { level: 'off' }, getModelInfo('openai-compatible', 'llama')),
		).toBeUndefined()
	})

	it('maps Anthropic levels to thinking budgets', () => {
		const anthropic = provider({ id: 'a', kind: 'anthropic' })
		const info = getModelInfo('anthropic', 'claude-sonnet-4-5')
		const options = buildProviderOptions(anthropic, 'claude-sonnet-4-5', { level: 'medium' }, info) as {
			anthropic: { thinking: { budgetTokens: number }; sendReasoning: boolean }
		}
		expect(options.anthropic.thinking.budgetTokens).toBe(8192)
		expect(options.anthropic.sendReasoning).toBe(true)
	})

	it('uses the fixed provider key for OpenAI', () => {
		const openai = provider({ id: 'openai-main', kind: 'openai' })
		const info = getModelInfo('openai', 'gpt-5')
		const options = buildProviderOptions(openai, 'gpt-5', { level: 'high' }, info) as Record<string, unknown>
		expect(options.openai).toEqual({ reasoningEffort: 'high' })
	})

	it('uses the fixed provider key for compatible servers', () => {
		const local = provider({ id: 'my-server', kind: 'openai-compatible' })
		const info = getModelInfo('openai-compatible', 'qwen3-32b')
		const options = buildProviderOptions(local, 'qwen3-32b', { level: 'low' }, info) as Record<string, unknown>
		// The instance name is the deprecated key; the adapter reads `openaiCompatible`.
		expect(options.openaiCompatible).toEqual({ reasoningEffort: 'low' })
		expect(options['my-server']).toBeUndefined()
	})

	it('omits the effort for auto', () => {
		const openai = provider({ id: 'o', kind: 'openai' })
		const info = getModelInfo('openai', 'gpt-5')
		expect(buildProviderOptions(openai, 'gpt-5', { level: 'auto' }, info)).toBeUndefined()
	})
})
