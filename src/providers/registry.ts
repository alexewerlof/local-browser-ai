import type { LanguageModel } from 'ai'
import type { ProviderOptions } from '@ai-sdk/provider-utils'
import type { ProviderSettings, ThinkingSelection } from '../core/types'
import { getModelInfo, type ModelInfo } from './catalog'

/** Remove a trailing endpoint suffix and make sure the base ends in `/v1`. */
export function normalizeBaseURL(baseURL: string | undefined, fallback: string): string {
	const raw = (baseURL ?? '').trim() || fallback
	let value = raw.replace(/\/+$/, '')
	value = value.replace(/\/(chat\/completions|completions|messages|responses|models)$/, '')
	if (!/\/v\d+$/.test(value)) value = `${value}/v1`
	return value
}

/** llama-server's default port; the provider editor hints at Ollama and LM Studio alongside it. */
export const DEFAULT_BASE_URL = 'http://localhost:9931/v1'

/**
 * Build an AI SDK language model for a provider instance.
 *
 * The adapter is imported dynamically so its code loads only when a run starts. Sampling
 * and reasoning options are passed to `streamText`, not to the client.
 */
export async function createLanguageModel(provider: ProviderSettings, modelId: string): Promise<LanguageModel> {
	const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible')
	const client = createOpenAICompatible({
		name: provider.id,
		apiKey: provider.apiKey || undefined,
		baseURL: normalizeBaseURL(provider.baseURL, DEFAULT_BASE_URL),
		headers: provider.headers,
		includeUsage: true,
	})
	return client.chatModel(modelId)
}

/**
 * Provider-specific knobs (reasoning effort) passed to `streamText`.
 * Providers ignore options they do not understand.
 */
export function buildProviderOptions(
	provider: ProviderSettings,
	modelId: string,
	thinking: ThinkingSelection,
	info: ModelInfo = getModelInfo(modelId),
): ProviderOptions | undefined {
	if (!info.reasoning || thinking.level === 'off') return undefined

	const effort = thinking.level === 'auto' ? undefined : thinking.level
	if (!effort) return undefined
	// The hyphenated key and the per-instance name are the deprecated spellings, and
	// passing either logs a warning on every request.
	return { openaiCompatible: { reasoningEffort: effort } }
}

/** Read the text of an HTTP error body without letting a huge body through. */
export async function readErrorBody(response: Response): Promise<string> {
	try {
		const text = await response.text()
		return text.slice(0, 400)
	} catch {
		return ''
	}
}
