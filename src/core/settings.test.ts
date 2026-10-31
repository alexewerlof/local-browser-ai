import { describe, expect, it } from 'vitest'
import { defaultSettings, normalizeSettings } from './settings'

describe('normalizeSettings', () => {
	it('falls back to defaults for garbage input', () => {
		const settings = normalizeSettings('nope')
		expect(settings.version).toBe(1)
		expect(settings.providers[0]?.kind).toBe('prompt-api')
		expect(settings.providers[0]?.models).toEqual(['text'])
	})

	it('adds the system prompt when an older store did not have one', () => {
		const stored: Record<string, unknown> = { ...defaultSettings() }
		delete stored.systemPrompt
		const settings = normalizeSettings(stored)
		expect(settings.systemPrompt.length).toBeGreaterThan(20)
	})

	it('always restores the built-in provider', () => {
		const stored = {
			...defaultSettings(),
			providers: [
				{
					id: 'local',
					kind: 'openai-compatible',
					label: 'Local',
					baseURL: 'http://localhost:8080/v1',
					models: ['llama'],
				},
			],
			defaultModel: { providerId: 'local', modelId: 'llama' },
		}
		const settings = normalizeSettings(stored)
		expect(settings.providers.map((provider) => provider.id)).toEqual(['prompt-api', 'local'])
		expect(settings.defaultModel).toEqual({ providerId: 'local', modelId: 'llama' })
	})

	it('re-adds built-in skills that were removed or edited away', () => {
		const stored = { ...defaultSettings(), skills: [] }
		const settings = normalizeSettings(stored)
		expect(settings.skills.map((skill) => skill.id)).toContain('summarize-page')
	})

	it('drops unknown tool ids', () => {
		const stored = {
			...defaultSettings(),
			tools: { enabled: ['find_in_page', 'does_not_exist'], autoApprove: ['nope'] },
		}
		const settings = normalizeSettings(stored)
		expect(settings.tools.enabled).toEqual(['find_in_page'])
		expect(settings.tools.autoApprove).toEqual([])
	})

	it('resets the default model when its provider is gone', () => {
		const stored = {
			...defaultSettings(),
			defaultModel: { providerId: 'ghost', modelId: 'x' },
		}
		const settings = normalizeSettings(stored)
		expect(settings.defaultModel).toEqual({ providerId: 'prompt-api', modelId: 'text' })
	})

	it('clamps nothing silently: it rejects out-of-range numbers', () => {
		const stored = {
			...defaultSettings(),
			context: { ...defaultSettings().context, compactionThreshold: 0.2 },
		}
		// Out of range means the whole object is rejected, which keeps invalid values out.
		expect(normalizeSettings(stored).context.compactionThreshold).toBe(0.75)
	})
})
