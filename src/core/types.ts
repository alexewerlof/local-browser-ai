/** Domain model shared by the side panel, the options page and the background worker. */

export type ProviderKind = 'prompt-api' | 'openai' | 'anthropic' | 'deepseek' | 'openai-compatible'

export interface ModelRef {
	providerId: string
	modelId: string
}

export type ErrorKind =
	| 'aborted'
	| 'auth'
	| 'rate-limit'
	| 'context-overflow'
	| 'network'
	| 'model-not-found'
	| 'permission'
	| 'unsupported'
	| 'invalid-request'
	| 'unknown'

export interface Usage {
	inputTokens: number
	outputTokens: number
	reasoningTokens?: number
	cachedInputTokens?: number
	/** True when the numbers came from the provider rather than an estimate. */
	exact: boolean
}

/* ------------------------------------------------------------------ messages */

export interface TextPart {
	type: 'text'
	text: string
}

export interface ReasoningPart {
	type: 'reasoning'
	text: string
	durationMs?: number
}

export type ToolCallState = 'pending' | 'running' | 'complete' | 'error' | 'denied'

export interface ToolCallPart {
	type: 'tool-call'
	toolCallId: string
	toolName: string
	input: unknown
	state: ToolCallState
	output?: unknown
	error?: string
}

export interface ErrorPart {
	type: 'error'
	kind: ErrorKind
	message: string
	retryable: boolean
}

export interface AttachmentRefPart {
	type: 'attachment-ref'
	attachmentId: string
}

export type MessagePart = TextPart | ReasoningPart | ToolCallPart | ErrorPart | AttachmentRefPart

export type MessageStatus = 'streaming' | 'complete' | 'aborted' | 'error'
export type Role = 'user' | 'assistant' | 'system'

export interface ChatMessage {
	id: string
	role: Role
	parts: MessagePart[]
	createdAt: number
	status: MessageStatus
	usage?: Usage
	model?: ModelRef
	/** The skill that was applied when this user message was sent. */
	skillId?: string
}

/* --------------------------------------------------------------- page context */

export interface OutlineEntry {
	id: string
	level: number
	text: string
	/** Zero-based line offset in the attachment markdown. */
	line: number
}

export interface PageChunk {
	id: string
	heading: string
	text: string
	line: number
}

export interface PageAttachment {
	id: string
	url: string
	title: string
	faviconUrl?: string
	/** Extracted, cleaned markdown. */
	markdown: string
	/** Plain-text version used for lexical search and estimates. */
	outline: OutlineEntry[]
	chunks: PageChunk[]
	capturedAt: number
	/** Set when the tab has navigated or lost its activeTab grant since capture. */
	stale: boolean
	truncated: boolean
	totalChars: number
}

/* ------------------------------------------------------------- conversations */

export interface ConversationSummary {
	text: string
	/** Messages up to and including this id are represented by the summary. */
	throughMessageId: string
	createdAt: number
	tokenEstimate: number
}

export interface Conversation {
	id: string
	title: string
	createdAt: number
	updatedAt: number
	model: ModelRef | null
	messages: ChatMessage[]
	attachments: PageAttachment[]
	summary: ConversationSummary | null
	/** Last known token usage of the assembled context (not persisted for long). */
	contextTokens: number
}

/* -------------------------------------------------------------------- skills */

export interface Skill {
	id: string
	name: string
	description?: string
	prompt: string
	builtIn?: boolean
}

/* ------------------------------------------------------------------- settings */

export interface ThinkingSelection {
	/** 'off' disables reasoning output; 'auto' lets the provider decide. */
	level: 'off' | 'auto' | 'low' | 'medium' | 'high' | 'custom'
	/** Only used with level === 'custom'; interpreted as a token budget. */
	tokens?: number
}

export interface ProviderSettings {
	id: string
	kind: ProviderKind
	label: string
	baseURL?: string
	apiKey?: string
	headers?: Record<string, string>
	/** Model ids discovered from the provider or entered by hand. */
	models: string[]
	contextWindowOverride?: number
	maxOutputTokensOverride?: number
}

export interface ModelDefaults {
	temperature: number
	maxOutputTokens?: number
	thinking: ThinkingSelection
}

export interface ContextSettings {
	/** Fraction of the window at which compaction runs (0.5 - 0.95). */
	compactionThreshold: number
	keepRecentTurns: number
	/** Fraction of the window reserved for the model's output. */
	outputReserveRatio: number
	maxToolSteps: number
	pageContext: 'auto' | 'always' | 'never'
	strategy: 'tiered' | 'full' | 'outline'
}

export interface ToolSettings {
	/** Tool ids that are enabled; unknown ids are ignored. */
	enabled: string[]
	/** Tool ids that may run without asking the user. */
	autoApprove: string[]
}

export interface UiSettings {
	theme: 'system' | 'light' | 'dark'
	sendKey: 'enter' | 'mod+enter'
}

export interface AppSettings {
	version: 1
	providers: ProviderSettings[]
	defaultModel: ModelRef | null
	modelDefaults: ModelDefaults
	context: ContextSettings
	tools: ToolSettings
	skills: Skill[]
	ui: UiSettings
	systemPrompt: string
}

/* --------------------------------------------------------------- capabilities */

export interface ModelCapabilities {
	tools: boolean
	reasoning: boolean
	vision: boolean
	streaming: boolean
}

export interface ThinkingOption {
	value: ThinkingSelection['level']
	label: string
}
