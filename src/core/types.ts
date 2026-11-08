/** Domain model shared by the side panel, the Settings page and the background worker. */

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
	/** Friendly name for the call card; falls back to a label map keyed by `toolName`. */
	label?: string
	/** MCP server label when the call went to a remote MCP server. */
	server?: string
}

export interface ErrorPart {
	type: 'error'
	kind: ErrorKind
	message: string
	retryable: boolean
}

/**
 * Marks the point in the conversation where a page was added. The page's frozen
 * prompt block rides the message that carries this part, so the prompt only ever
 * grows at the end and earlier turns stay byte-identical for the KV cache.
 */
export interface PageRefPart {
	type: 'page-ref'
	pageId: string
}

export type MessagePart = TextPart | ReasoningPart | ToolCallPart | ErrorPart | PageRefPart

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
	/**
	 * How many model calls produced this answer, counted from the provider's steps. The
	 * transcript keeps the steps but not their boundaries, so the count is stored rather
	 * than guessed back from `parts`.
	 */
	steps?: number
	/** Wall-clock time spent on this answer, across every run that added to it. */
	durationMs?: number
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

/**
 * How the page text was produced. `article` is cleaned prose, `app` is the
 * accessibility skeleton of a UI-shaped page, `text` is a plain fallback.
 */
export type PageRepresentation = 'article' | 'app' | 'text'

/**
 * How a page came into the chat. The user adds pages; the search tool captures its own
 * results so the model can read them, which is the extension working rather than a
 * reference the user chose.
 */
export type PageSource = 'user' | 'search'

/**
 * One page the user added to a chat. Captured once and immutable afterwards: the full
 * text lives here, outside the conversation, and the model pulls what it needs with
 * the page tools.
 */
export interface PageSnapshot {
	id: string
	/**
	 * The chat this page was added to. Pages outlive no chat: deleting the chat deletes
	 * them. It lives here rather than on `Conversation` because `runTurn` rewrites the
	 * conversation for every token, which would drop a page added while it streams.
	 */
	conversationId: string
	/**
	 * The handle the model names this page by, e.g. `p1`. Deliberately not a URL: a
	 * future fetch tool must not be able to confuse a captured page with the open web.
	 */
	handle: string
	url: string
	title: string
	faviconUrl?: string
	/** Extracted, cleaned markdown. */
	markdown: string
	/** Which extractor produced `markdown`. Missing on snapshots stored before it existed. */
	representation?: PageRepresentation
	/** The page's own `lang` attribute, e.g. `de-DE`. Missing when the page declares none. */
	lang?: string
	/** Plain-text version used for lexical search and estimates. */
	outline: OutlineEntry[]
	chunks: PageChunk[]
	capturedAt: number
	truncated: boolean
	totalChars: number
	/**
	 * The prompt text for this page, rendered once at capture and stored verbatim. It is
	 * never regenerated, so adding a page cannot rewrite an earlier turn.
	 */
	block: string
	/** The message that carries the block; unset while the page waits for the next turn. */
	messageId?: string
	/**
	 * Where the page came from. Unset is a page the user added; `search` is a results page
	 * the tool captured for the model, which is not shown as a reference (`isPageReference`).
	 */
	source?: PageSource
	/** The tab it came from, used only to re-focus that tab when its card is clicked. */
	tabIdHint?: number
}

/**
 * What extraction produces: everything a snapshot has except the three things decided
 * when the page joins a conversation — its chat, its handle and its frozen prompt block.
 */
export type CapturedPage = Omit<PageSnapshot, 'conversationId' | 'handle' | 'block' | 'messageId' | 'source'>

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
	summary: ConversationSummary | null
	/** Last known token usage of the assembled context (not persisted for long). */
	contextTokens: number
}

/**
 * A prompt the user submitted while the agent was busy. Queues are per conversation
 * and live in their own IndexedDB store, not on `Conversation`: `runTurn` commits a
 * working copy of the conversation for every token, which would otherwise overwrite a
 * removal made while the run is still streaming.
 */
export interface QueuedPrompt {
	id: string
	text: string
	/** The skill that was active when the prompt was queued, so draining keeps it. */
	skillId?: string
	createdAt: number
}

/* -------------------------------------------------------------------- skills */

export interface Skill {
	id: string
	name: string
	description?: string
	prompt: string
	builtIn?: boolean
}

/* -------------------------------------------------------------------- memory */

/**
 * How a memory reaches the context.
 *
 * `always` is injected on every turn, `auto` only when the prompt matches it, and
 * `tool` is passive: it sits in storage until the model asks for it with `recall`.
 */
export type MemoryMode = 'always' | 'auto' | 'tool'

/**
 * `global` is the only scope in v1. A future per-site scope only needs a new value
 * here plus a filter in the selector; the record shape does not change.
 */
export type MemoryScope = 'global'

export interface MemorySource {
	conversationId: string
	messageId?: string
}

export interface MemoryItem {
	id: string
	/** Short label shown in Settings. May be empty; the text is then used as the preview. */
	title: string
	text: string
	mode: MemoryMode
	scope: MemoryScope
	createdAt: number
	updatedAt: number
	/**
	 * Set when the user deletes the item. The record is kept for a while so a sync
	 * backend can propagate the deletion instead of resurrecting the item.
	 */
	deletedAt?: number
	/** Which chat the item came from, when the user saved it from a message. */
	source?: MemorySource
}

export interface MemoryDocument {
	version: number
	items: MemoryItem[]
}

/** Versioned envelope used by export and import, so a file says what it contains. */
export interface MemoryExport {
	kind: 'local-browser-ai.memory'
	version: number
	exportedAt: number
	items: MemoryItem[]
}

export interface MemorySettings {
	/** Master switch for injection and for the memory tools. */
	enabled: boolean
	/** Largest share of the usable window the injected memory block may occupy (0.05 - 0.4). */
	injectShare: number
	/** Maximum number of matching `auto` memories injected in one turn. */
	autoLimit: number
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
}

export interface ToolSettings {
	/** Tool ids that are enabled; unknown ids are ignored. */
	enabled: string[]
	/** Tool ids that may run without asking the user. */
	autoApprove: string[]
	/** Remote MCP servers whose tools may be offered to the model. */
	mcp: McpServerSettings[]
}

/**
 * One MCP server. Transport is Streamable HTTP only: the extension has no process to
 * spawn, so stdio servers cannot be supported.
 */
export interface McpServerSettings {
	id: string
	label: string
	/** Streamable HTTP endpoint, for example `http://127.0.0.1:9000/mcp`. */
	url: string
	/** Extra request headers, typically an Authorization token. */
	headers: Record<string, string>
	/** Whether the server's tools are offered to the model at all. */
	enabled: boolean
	/** Run this server's tools without asking for approval. */
	autoApprove: boolean
	/** Tool names the user turned off inside an otherwise enabled server. */
	disabledTools: string[]
	/**
	 * Send requests without an `Origin` header. Many MCP servers reject browser
	 * requests by origin (DNS-rebinding protection) and only accept clients that look
	 * like a local agent; a browser cannot drop the header by itself, so the extension
	 * removes it with a network rule for this endpoint.
	 */
	stripOrigin: boolean
}

/** Chrome's own font-size ladder; `medium` is the panel's designed size. */
export type FontSize = 'very-small' | 'small' | 'medium' | 'large' | 'very-large'

export interface UiSettings {
	theme: 'system' | 'light' | 'dark'
	/** Which key combination submits the composer. */
	submitKey: 'enter' | 'mod+enter'
	/** Text size of the panel and the Settings page. */
	fontSize: FontSize
}

/**
 * Expensive parts of rendering the transcript. Both are opt-out/in because they pull in a
 * large chunk at runtime; the cheap parts of markdown always render.
 */
export interface RenderingSettings {
	/** Typeset `$$…$$` LaTeX with KaTeX. */
	math: boolean
	/** Highlight fenced code blocks with Shiki. */
	codeHighlighting: boolean
}

export interface AppSettings {
	version: 10
	providers: ProviderSettings[]
	defaultModel: ModelRef | null
	modelDefaults: ModelDefaults
	context: ContextSettings
	tools: ToolSettings
	skills: Skill[]
	memory: MemorySettings
	rendering: RenderingSettings
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
