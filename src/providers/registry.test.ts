import { describe, expect, it } from 'vitest'
import { DEFAULT_BASE_URL, buildProviderOptions, normalizeBaseURL } from './registry'
import { getModelInfo } from './catalog'
import type { ProviderSettings } from '../core/types'

function provider(overrides: Partial<ProviderSettings> = {}): ProviderSettings {
	return {
		id: 'local',
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
		expect(normalizeBaseURL('', 'http://localhost:1234/v1')).toBe('http://localhost:1234/v1')
		expect(normalizeBaseURL(undefined, DEFAULT_BASE_URL)).toBe(DEFAULT_BASE_URL)
	})
})

describe('buildProviderOptions', () => {
	it('returns nothing when reasoning is off', () => {
		expect(buildProviderOptions(provider(), 'llama', { level: 'off' }, getModelInfo('llama'))).toBeUndefined()
	})

	it('maps a level to reasoning effort for a compatible server', () => {
		const local = provider({ id: 'my-server' })
		const options = buildProviderOptions(local, 'qwen3-32b', { level: 'low' }) as Record<string, unknown>
		// The instance name is the deprecated key; the adapter reads `openaiCompatible`.
		expect(options.openaiCompatible).toEqual({ reasoningEffort: 'low' })
		expect(options['my-server']).toBeUndefined()
	})

	it('omits the effort for auto', () => {
		expect(buildProviderOptions(provider({ id: 'o' }), 'qwen3-32b', { level: 'auto' })).toBeUndefined()
	})

	it('returns nothing for a model without a reasoning mode', () => {
		expect(buildProviderOptions(provider(), 'llama3:8b', { level: 'high' })).toBeUndefined()
	})
})
