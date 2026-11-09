import { describe, expect, it } from 'vitest'
import { parseModelEntry } from './discovery'

describe('parseModelEntry', () => {
	it('reads llama.cpp architecture, loaded context and launch limits', () => {
		const model = parseModelEntry({
			id: 'unsloth/Qwen3.6-35B-A3B-MTP-GGUF:Q4_K_XL',
			architecture: { input_modalities: ['text', 'image', 'video'], output_modalities: ['text'] },
			context_length: 262_144,
			meta: { n_ctx: 65_536, n_ctx_train: 262_144 },
			status: {
				value: 'loaded',
				args: ['--ctx-size', '65536', '--n-predict', '8192'],
			},
		})

		expect(model).toEqual({
			id: 'unsloth/Qwen3.6-35B-A3B-MTP-GGUF:Q4_K_XL',
			label: undefined,
			state: 'loaded',
			// The loaded window beats the trained maximum and the launch flag.
			contextWindow: 65_536,
			maxOutputTokens: 8192,
			inputModalities: ['text', 'image', 'video'],
			outputModalities: ['text'],
		})
	})

	it('uses the launch context when the preset is not loaded yet', () => {
		const model = parseModelEntry({
			id: 'gemma-4-12B-it',
			context_length: 262_144,
			status: { value: 'unloaded', args: ['--ctx-size', '65536'] },
		})
		expect(model?.contextWindow).toBe(65_536)
		expect(model?.state).toBe('unloaded')
	})

	it('reports nothing it was not told', () => {
		const model = parseModelEntry({ id: 'gpt-4o' })
		expect(model).toEqual({ id: 'gpt-4o', label: undefined })
		expect(model?.inputModalities).toBeUndefined()
		expect(model?.outputModalities).toBeUndefined()
		expect(model?.contextWindow).toBeUndefined()
		expect(model?.maxOutputTokens).toBeUndefined()
		expect(model?.state).toBeUndefined()
	})

	it('keeps a display name only when it differs from the id', () => {
		expect(parseModelEntry({ id: 'gemma-4-12B-it', display_name: 'Gemma 4 12B' })?.label).toBe('Gemma 4 12B')
		expect(parseModelEntry({ id: 'gemma-4-12B-it', name: 'gemma-4-12B-it' })?.label).toBeUndefined()
	})

	it('ignores modalities it does not know', () => {
		const model = parseModelEntry({
			id: 'some-model',
			architecture: { input_modalities: ['text', 'hologram'], output_modalities: [] },
		})
		expect(model?.inputModalities).toEqual(['text'])
		expect(model?.outputModalities).toBeUndefined()
	})

	it('reads max_tokens and context_window spellings', () => {
		const model = parseModelEntry({
			id: 'some-model',
			context_window: 32_000,
			max_output_tokens: 4_096,
		})
		expect(model?.contextWindow).toBe(32_000)
		expect(model?.maxOutputTokens).toBe(4096)
	})

	it('prefers the loaded context over every other spelling', () => {
		const model = parseModelEntry({
			id: 'some-model',
			context_window: 32_000,
			context_length: 128_000,
			meta: { n_ctx: 8192 },
			status: { args: ['--ctx-size', '16384'] },
		})
		expect(model?.contextWindow).toBe(8192)
	})

	it('rejects an entry with no id', () => {
		expect(parseModelEntry({})).toBeNull()
	})
})
