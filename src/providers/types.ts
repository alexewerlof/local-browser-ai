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
	needsKey: boolean
	needsBaseURL: boolean
}

/** Presets shown in the "Add provider" flow. */
export const PROVIDER_PRESETS: ProviderPreset[] = [
	{
		kind: 'prompt-api',
		label: 'Built-in browser model',
		description: 'Chrome or Edge downloads a small model. No account, no network requests after download.',
		defaultBaseURL: '',
		needsKey: false,
		needsBaseURL: false,
	},
	{
		kind: 'openai-compatible',
		label: 'Local server (OpenAI-compatible)',
		description: 'llama.cpp, Ollama, LM Studio, vLLM, or anything else serving POST /v1/chat/completions.',
		defaultBaseURL: 'http://localhost:9931/v1',
		needsKey: false,
		needsBaseURL: true,
	},
	{
		kind: 'openai',
		label: 'OpenAI',
		description: 'GPT models from api.openai.com, or a compatible proxy.',
		defaultBaseURL: 'https://api.openai.com/v1',
		needsKey: true,
		needsBaseURL: true,
	},
	{
		kind: 'anthropic',
		label: 'Anthropic',
		description: 'Claude models. Supports extended thinking budgets.',
		defaultBaseURL: 'https://api.anthropic.com/v1',
		needsKey: true,
		needsBaseURL: true,
	},
	{
		kind: 'deepseek',
		label: 'DeepSeek',
		description: 'DeepSeek chat and reasoning models.',
		defaultBaseURL: 'https://api.deepseek.com/v1',
		needsKey: true,
		needsBaseURL: true,
	},
]
