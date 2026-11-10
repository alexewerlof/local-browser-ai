import type { ProviderKind } from '../core/types'

export type PromptAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported'

export interface PromptApiStatus {
	availability: PromptAvailability
	contextWindow?: number
	inputUsage?: number
	message?: string
}

export interface ProviderPreset {
	kind: ProviderKind
	label: string
	description: string
	defaultBaseURL: string
}

/** Short form of a kind, for a badge beside a provider's name. */
export const PROVIDER_KIND_LABELS: Record<ProviderKind, string> = {
	'prompt-api': 'Built-in',
	'openai-compatible': 'Local server',
}

/** Presets shown in the "Add provider" flow. */
export const PROVIDER_PRESETS: ProviderPreset[] = [
	{
		kind: 'prompt-api',
		label: 'Built-in browser model',
		description: 'Chrome or Edge downloads a small model. No account, no network requests after download.',
		defaultBaseURL: '',
	},
	{
		kind: 'openai-compatible',
		label: 'Local server (OpenAI-compatible)',
		description: 'llama.cpp, Ollama, LM Studio, vLLM, or anything else serving POST /v1/chat/completions.',
		defaultBaseURL: 'http://localhost:9931/v1',
	},
]
