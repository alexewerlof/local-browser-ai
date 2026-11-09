import type {
	ModelCapabilities,
	ModelDetails,
	ProviderKind,
	ProviderSettings,
	ThinkingOption,
	ThinkingSelection,
} from '../core/types'

export interface ModelInfo {
	id: string
	label: string
	contextWindow: number
	maxOutputTokens: number
	capabilities: ModelCapabilities
}

interface ModelPattern {
	test: RegExp
	info: Omit<ModelInfo, 'id' | 'label'>
}

const TEXT_CAPABILITIES: ModelCapabilities = {
	tools: true,
	reasoning: false,
	vision: false,
	streaming: true,
}

const REASONING_CAPABILITIES: ModelCapabilities = {
	tools: true,
	reasoning: true,
	vision: false,
	streaming: true,
}

/**
 * Conservative defaults per provider kind. Anything we do not recognise still works:
 * the user can override the context window and max output in Settings, and tools are
 * offered whenever the provider kind supports them.
 */
const PROVIDER_DEFAULTS: Record<ProviderKind, ModelInfo> = {
	'prompt-api': {
		id: 'text',
		label: 'Built-in model',
		contextWindow: 6144,
		maxOutputTokens: 1024,
		capabilities: { tools: false, reasoning: false, vision: false, streaming: true },
	},
	openai: {
		id: 'gpt-4o-mini',
		label: 'OpenAI',
		contextWindow: 128_000,
		maxOutputTokens: 16_384,
		capabilities: TEXT_CAPABILITIES,
	},
	anthropic: {
		id: 'claude-sonnet-4-5',
		label: 'Claude',
		contextWindow: 200_000,
		maxOutputTokens: 8192,
		capabilities: REASONING_CAPABILITIES,
	},
	deepseek: {
		id: 'deepseek-chat',
		label: 'DeepSeek',
		contextWindow: 128_000,
		maxOutputTokens: 8192,
		capabilities: TEXT_CAPABILITIES,
	},
	'openai-compatible': {
		id: '',
		label: 'Local model',
		contextWindow: 8192,
		maxOutputTokens: 2048,
		capabilities: TEXT_CAPABILITIES,
	},
}

const OPENAI_PATTERNS: ModelPattern[] = [
	{
		test: /gpt-5|gpt-6/i,
		info: { contextWindow: 400_000, maxOutputTokens: 128_000, capabilities: REASONING_CAPABILITIES },
	},
	{
		test: /^o[134](-|$)|o[134]-/i,
		info: { contextWindow: 200_000, maxOutputTokens: 100_000, capabilities: REASONING_CAPABILITIES },
	},
	{ test: /gpt-4\.1/i, info: { contextWindow: 1_000_000, maxOutputTokens: 32_768, capabilities: TEXT_CAPABILITIES } },
	{
		test: /gpt-4o/i,
		info: { contextWindow: 128_000, maxOutputTokens: 16_384, capabilities: { ...TEXT_CAPABILITIES, vision: true } },
	},
]

const ANTHROPIC_PATTERNS: ModelPattern[] = [
	{
		test: /claude/i,
		info: { contextWindow: 200_000, maxOutputTokens: 32_000, capabilities: REASONING_CAPABILITIES },
	},
]

const DEEPSEEK_PATTERNS: ModelPattern[] = [
	{
		test: /reasoner|r1/i,
		info: { contextWindow: 128_000, maxOutputTokens: 64_000, capabilities: REASONING_CAPABILITIES },
	},
	{ test: /deepseek/i, info: { contextWindow: 128_000, maxOutputTokens: 8192, capabilities: TEXT_CAPABILITIES } },
]

const LOCAL_PATTERNS: ModelPattern[] = [
	{
		test: /qwen3|qwq|deepseek-r1|reason|thinking/i,
		info: { contextWindow: 32_768, maxOutputTokens: 4096, capabilities: REASONING_CAPABILITIES },
	},
	{
		test: /llama|mistral|gemma|phi|qwen/i,
		info: { contextWindow: 32_768, maxOutputTokens: 4096, capabilities: TEXT_CAPABILITIES },
	},
]

function patternsFor(kind: ProviderKind): ModelPattern[] {
	switch (kind) {
		case 'openai':
			return OPENAI_PATTERNS
		case 'anthropic':
			return ANTHROPIC_PATTERNS
		case 'deepseek':
			return DEEPSEEK_PATTERNS
		case 'openai-compatible':
			return LOCAL_PATTERNS
		default:
			return []
	}
}

/** Look up what we know about a model, falling back to provider-kind defaults. */
export function getModelInfo(kind: ProviderKind, modelId: string): ModelInfo {
	const fallback = PROVIDER_DEFAULTS[kind]
	if (kind === 'prompt-api') return { ...fallback }
	const pattern = patternsFor(kind).find((candidate) => candidate.test.test(modelId))
	const label = modelId || fallback.label
	if (!pattern) return { ...fallback, id: modelId, label }
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
		getModelInfo(provider.kind, modelId).contextWindow
	)
}

/** The output cap for one model, with the same precedence as the context window. */
export function modelMaxOutputTokens(provider: ProviderSettings, modelId: string): number {
	return (
		provider.maxOutputTokensOverride ??
		detailsFor(provider, modelId)?.maxOutputTokens ??
		getModelInfo(provider.kind, modelId).maxOutputTokens
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

export function thinkingOptions(kind: ProviderKind, info: ModelInfo): ThinkingOption[] {
	if (!info.capabilities.reasoning) return [{ value: 'off', label: 'Off' }]
	if (kind === 'anthropic') {
		return [
			{ value: 'off', label: 'Off' },
			{ value: 'low', label: 'Light' },
			{ value: 'medium', label: 'Standard' },
			{ value: 'high', label: 'Deep' },
		]
	}
	return [
		{ value: 'off', label: 'Off' },
		{ value: 'auto', label: 'Auto' },
		{ value: 'low', label: 'Low' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'high', label: 'High' },
	]
}

/** Resolve a thinking selection into an Anthropic token budget. */
export function thinkingBudget(selection: ThinkingSelection, info: ModelInfo): number {
	if (selection.level === 'custom' && selection.tokens) return selection.tokens
	const cap = Math.max(1024, Math.min(info.maxOutputTokens - 1024, 64_000))
	switch (selection.level) {
		case 'low':
			return Math.min(2048, cap)
		case 'medium':
			return Math.min(8192, cap)
		case 'high':
			return cap
		default:
			return 0
	}
}

/** Snap a selection to something the model actually supports. */
export function normalizeThinking(
	selection: ThinkingSelection,
	kind: ProviderKind,
	info: ModelInfo,
): ThinkingSelection {
	if (!info.capabilities.reasoning) return { level: 'off' }
	const options = thinkingOptions(kind, info).map((option) => option.value)
	if (options.includes(selection.level)) return selection
	return { level: 'auto' }
}
