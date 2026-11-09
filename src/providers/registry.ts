import type { LanguageModel } from 'ai'
import type { ProviderOptions } from '@ai-sdk/provider-utils'
import type { ProviderSettings, ThinkingSelection } from '../core/types'
import { getModelInfo, thinkingBudget, type ModelInfo } from './catalog'
import { AppError } from './errors'

/** Remove a trailing endpoint suffix and make sure the base ends in `/v1`. */
export function normalizeBaseURL(baseURL: string | undefined, fallback: string): string {
	const raw = (baseURL ?? '').trim() || fallback
	let value = raw.replace(/\/+$/, '')
	value = value.replace(/\/(chat\/completions|completions|messages|responses|models)$/, '')
	if (!/\/v\d+$/.test(value)) value = `${value}/v1`
	return value
}

export const DEFAULT_BASE_URLS: Record<string, string> = {
	openai: 'https://api.openai.com/v1',
	anthropic: 'https://api.anthropic.com/v1',
	deepseek: 'https://api.deepseek.com/v1',
	// llama-server's default port; Ollama and LM Studio are user-entered examples elsewhere.
	'openai-compatible': 'http://localhost:9931/v1',
}

export interface CreateModelOptions {
	temperature?: number
	thinking?: ThinkingSelection
	info?: ModelInfo
}

/**
 * Build an AI SDK language model for a provider instance.
 *
 * Adapters are imported dynamically so only the selected provider's code is loaded.
 */
export async function createLanguageModel(
	provider: ProviderSettings,
	modelId: string,
	options: CreateModelOptions = {},
): Promise<LanguageModel> {
	const baseURL = normalizeBaseURL(provider.baseURL, DEFAULT_BASE_URLS[provider.kind] ?? '')

	switch (provider.kind) {
		case 'prompt-api': {
			const { browserAI } = await import('@browser-ai/core')
			return browserAI.chat('text', {
				temperature: options.temperature ?? 0.7,
			}) as unknown as LanguageModel
		}
		case 'openai': {
			const { createOpenAI } = await import('@ai-sdk/openai')
			const client = createOpenAI({
				apiKey: provider.apiKey || undefined,
				baseURL,
				headers: provider.headers,
			})
			return client.chat(modelId)
		}
		case 'anthropic': {
			const { createAnthropic } = await import('@ai-sdk/anthropic')
			const client = createAnthropic({
				apiKey: provider.apiKey || undefined,
				baseURL,
				headers: provider.headers,
			})
			return client.chat(modelId)
		}
		case 'deepseek': {
			const { createDeepSeek } = await import('@ai-sdk/deepseek')
			const client = createDeepSeek({
				apiKey: provider.apiKey || undefined,
				baseURL,
				headers: provider.headers,
			})
			return client.chat(modelId)
		}
		case 'openai-compatible': {
			const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible')
			const client = createOpenAICompatible({
				name: provider.id,
				apiKey: provider.apiKey || undefined,
				baseURL,
				headers: provider.headers,
				includeUsage: true,
			})
			return client.chatModel(modelId)
		}
		default:
			throw new AppError('unsupported', `Unsupported provider kind: ${String(provider.kind)}`)
	}
}

/**
 * Provider-specific knobs (reasoning effort, thinking budgets) passed to `streamText`.
 * Providers ignore options they do not understand.
 */
export function buildProviderOptions(
	provider: ProviderSettings,
	modelId: string,
	thinking: ThinkingSelection,
	info: ModelInfo = getModelInfo(provider.kind, modelId),
): ProviderOptions | undefined {
	if (!info.capabilities.reasoning || thinking.level === 'off') return undefined

	switch (provider.kind) {
		case 'anthropic': {
			const budgetTokens = thinkingBudget(thinking, info)
			if (!budgetTokens) return undefined
			return {
				anthropic: {
					thinking: { type: 'enabled', budgetTokens },
					sendReasoning: true,
				},
			}
		}
		case 'openai':
		case 'deepseek':
		case 'openai-compatible': {
			const effort = thinking.level === 'auto' ? undefined : thinking.level
			if (!effort) return undefined
			// The compatible adapter reads `openaiCompatible`; the hyphenated key and the
			// per-instance name are the deprecated spellings, and passing either logs a
			// warning on every request.
			if (provider.kind === 'openai-compatible') return { openaiCompatible: { reasoningEffort: effort } }
			const key = provider.kind
			return { [key]: { reasoningEffort: effort } }
		}
		default:
			return undefined
	}
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
