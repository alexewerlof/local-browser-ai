import type { ModelDetails, ProviderSettings, ThinkingOption, ThinkingSelection } from '../core/types'

export interface ModelInfo {
	id: string
	label: string
	contextWindow: number
	maxOutputTokens: number
	/** Whether the model exposes a reasoning effort, which is all the ThinkingMenu offers. */
	reasoning: boolean
}

interface ModelPattern {
	test: RegExp
	info: Omit<ModelInfo, 'id' | 'label'>
}

/**
 * Conservative defaults for a local server. Anything we do not recognise still works: the
 * user can override the context window and max output in Settings.
 */
const LOCAL_DEFAULTS: ModelInfo = {
	id: '',
	label: 'Local model',
	contextWindow: 8192,
	maxOutputTokens: 2048,
	reasoning: false,
}

const LOCAL_PATTERNS: ModelPattern[] = [
	{
		test: /qwen3|qwq|deepseek-r1|reason|thinking/i,
		info: { contextWindow: 32_768, maxOutputTokens: 4096, reasoning: true },
	},
	{
		test: /llama|mistral|gemma|phi|qwen/i,
		info: { contextWindow: 32_768, maxOutputTokens: 4096, reasoning: false },
	},
]

/** Look up what we know about a model id, falling back to the local-server defaults. */
export function getModelInfo(modelId: string): ModelInfo {
	const pattern = LOCAL_PATTERNS.find((candidate) => candidate.test.test(modelId))
	const label = modelId || LOCAL_DEFAULTS.label
	if (!pattern) return { ...LOCAL_DEFAULTS, id: modelId, label }
	return { id: modelId, label, ...pattern.info }
}

function detailsFor(provider: ProviderSettings, modelId: string): ModelDetails | undefined {
	return provider.modelDetails?.find((model) => model.id === modelId)
}

/**
 * The window for one model: the provider override, then what the server itself reported,
 * then the static catalog. A server's own figure beats a guess from the model id, and the
 * override stays the user's final say.
 */
export function modelContextWindow(provider: ProviderSettings, modelId: string): number {
	return (
		provider.contextWindowOverride ??
		detailsFor(provider, modelId)?.contextWindow ??
		getModelInfo(modelId).contextWindow
	)
}

/** The output cap for one model, with the same precedence as the context window. */
export function modelMaxOutputTokens(provider: ProviderSettings, modelId: string): number {
	return (
		provider.maxOutputTokensOverride ??
		detailsFor(provider, modelId)?.maxOutputTokens ??
		getModelInfo(modelId).maxOutputTokens
	)
}

/** True when the window came from the catalog rather than the server or an override. */
export function isContextWindowEstimated(provider: ProviderSettings, modelId: string): boolean {
	return provider.contextWindowOverride === undefined && detailsFor(provider, modelId)?.contextWindow === undefined
}

/** True when the output cap came from the catalog rather than the server or an override. */
export function isMaxOutputEstimated(provider: ProviderSettings, modelId: string): boolean {
	return (
		provider.maxOutputTokensOverride === undefined && detailsFor(provider, modelId)?.maxOutputTokens === undefined
	)
}

export function thinkingOptions(info: ModelInfo): ThinkingOption[] {
	if (!info.reasoning) return [{ value: 'off', label: 'Off' }]
	return [
		{ value: 'off', label: 'Off' },
		{ value: 'auto', label: 'Auto' },
		{ value: 'low', label: 'Low' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'high', label: 'High' },
	]
}

/** Snap a selection to something the model actually supports. */
export function normalizeThinking(selection: ThinkingSelection, info: ModelInfo): ThinkingSelection {
	if (!info.reasoning) return { level: 'off' }
	const options = thinkingOptions(info).map((option) => option.value)
	if (options.includes(selection.level)) return selection
	return { level: 'auto' }
}
