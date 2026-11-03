import { generateText, stepCountIs, streamText } from 'ai'
import type { ModelMessage, ToolSet } from 'ai'
import type {
	ChatMessage,
	AppSettings,
	Conversation,
	ConversationSummary,
	MessagePart,
	ModelRef,
	PageAttachment,
	ProviderSettings,
	Usage,
} from '../core/types'
import { Store } from '../core/store'
import { createId, now } from '../core/util'
import { enabledBuiltInTools, getProvider, hasEnabledTools, normalizeSettings } from '../core/settings'
import { buildContext, messageText, type ContextPart, type PageContextMode } from '../core/context/assembly'
import { buildSummaryPrompt, microCompact, planCompaction, usageRatio } from '../core/context/compaction'
import { createBudget, estimateTokens, type TokenBudget } from '../core/context/tokens'
import { buildTools, type ToolContext } from '../browser/tools'
import { getModelInfo, normalizeThinking, type ModelInfo } from '../providers/catalog'
import { AppError, toAppError } from '../providers/errors'
import { buildProviderOptions, createLanguageModel } from '../providers/registry'
import { getPromptApiStatus } from '../providers/prompt-status'
import { settingsStore } from './settings'
import { attachmentStore, requestApproval, tabIdStore } from './browser'
import { memoryAccess, memoryStore } from './memory'
import { buildMcpTools, enabledMcpServers, mcpWarningsStore, type McpToolBundle } from './mcp'
import { deleteConversation, loadConversation, saveConversation } from './database'

/* --------------------------------------------------------------------- state */

export type RunStatus = 'idle' | 'streaming' | 'compacting'

export interface RunState {
	status: RunStatus
	error?: { kind: string; message: string; retryable: boolean; hint?: string }
	startedAt?: number
	firstTokenAt?: number
	finishedAt?: number
	outputTokens?: number
	tokensPerSecond?: number
	steps?: number
}

export interface ContextSnapshot {
	parts: ContextPart[]
	usedTokens: number
	contextWindow: number
	compactionAt: number
	ratio: number
	pageMode: PageContextMode
	pageTruncated: boolean
	budget: TokenBudget | null
}

export function createConversation(model: ModelRef | null): Conversation {
	const timestamp = now()
	return {
		id: createId('chat'),
		title: 'New chat',
		createdAt: timestamp,
		updatedAt: timestamp,
		model,
		messages: [],
		attachments: [],
		summary: null,
		contextTokens: 0,
	}
}

export const conversationStore = new Store<Conversation>(createConversation(null))
export const runStore = new Store<RunState>({ status: 'idle' })
export const contextStore = new Store<ContextSnapshot>({
	parts: [],
	usedTokens: 0,
	contextWindow: 0,
	compactionAt: 0,
	ratio: 0,
	pageMode: 'none',
	pageTruncated: false,
	budget: null,
})

let activeController: AbortController | null = null

/* --------------------------------------------------------------- persistence */

let saveTimer: ReturnType<typeof setTimeout> | null = null
let savePending = false

function scheduleSave(): void {
	savePending = true
	if (saveTimer) return
	saveTimer = setTimeout(() => {
		saveTimer = null
		if (!savePending) return
		savePending = false
		void saveConversation(conversationStore.get())
	}, 400)
}

export async function flushPersistence(): Promise<void> {
	if (saveTimer) {
		clearTimeout(saveTimer)
		saveTimer = null
	}
	savePending = false
	await saveConversation(conversationStore.get())
}

/** Set the store and keep the tool mirror in sync. */
export function commit(conversation: Conversation): void {
	conversationStore.set(conversation)
	attachmentStore.set(conversation.attachments[0] ?? null)
	scheduleSave()
}

function patchMessage(
	conversation: Conversation,
	messageId: string,
	update: (message: ChatMessage) => ChatMessage,
): Conversation {
	return {
		...conversation,
		updatedAt: now(),
		messages: conversation.messages.map((message) => (message.id === messageId ? update(message) : message)),
	}
}

/* ------------------------------------------------------------ model selection */

interface Selection {
	ref: ModelRef
	provider: ProviderSettings
	info: ModelInfo
}

function resolveSelection(settings = settingsStore.get(), conversation = conversationStore.get()): Selection {
	const ref = conversation.model ?? settings.defaultModel
	if (!ref) throw new AppError('unsupported', 'Choose a model in Settings before starting a chat.')
	const provider = getProvider(settings, ref.providerId)
	if (!provider)
		throw new AppError('unsupported', 'The selected provider was removed. Pick another model in Settings.')
	const modelId = provider.kind === 'prompt-api' ? 'text' : ref.modelId
	return { ref: { ...ref, modelId }, provider, info: getModelInfo(provider.kind, modelId) }
}

const contextWindowCache = new Map<string, number>()

async function contextWindowFor(selection: Selection): Promise<number> {
	const { provider, info, ref } = selection
	if (provider.contextWindowOverride) return provider.contextWindowOverride
	const key = `${provider.id}:${ref.modelId}`
	const cached = contextWindowCache.get(key)
	if (cached) return cached

	let value = info.contextWindow
	if (provider.kind === 'prompt-api') {
		const status = await getPromptApiStatus()
		if (status.contextWindow) value = status.contextWindow
	}
	contextWindowCache.set(key, value)
	return value
}

/* ------------------------------------------------------------- context meter */

function publishContext(
	conversation: Conversation,
	settings = settingsStore.get(),
	selection?: Selection,
	/** Simpler override for the case where every selected tool source failed to load. */
	toolsEnabledOverride?: boolean,
): { messages: ModelMessage[]; system: string; budget: TokenBudget; totalTokens: number } {
	const resolved = selection ?? resolveSelectionQuietly(settings, conversation)
	const window = resolved ? contextWindowCache.get(`${resolved.provider.id}:${resolved.ref.modelId}`) : undefined
	const contextWindow = resolved?.provider.contextWindowOverride ?? window ?? 8192
	const budget = createBudget(
		contextWindow,
		settings.context.outputReserveRatio,
		settings.context.compactionThreshold,
	)
	const lastUser = [...conversation.messages].reverse().find((message) => message.role === 'user')
	const query = lastUser ? messageText(lastUser) : ''
	const assembled = buildContext({
		conversation,
		settings,
		budget,
		query,
		// Must match the submit path: a model that supports tools but has none enabled
		// cannot act on a page index either.
		toolsEnabled: toolsEnabledOverride ?? (Boolean(resolved?.info.capabilities.tools) && hasEnabledTools(settings)),
		mcpServers: enabledMcpServers(settings.tools.mcp).map((server) => server.label),
		memories: memoryStore.get().items,
		memoryToolsEnabled: settings.memory.enabled && settings.tools.enabled.includes('recall'),
	})

	contextStore.set({
		parts: assembled.parts,
		usedTokens: assembled.totalTokens,
		contextWindow,
		compactionAt: budget.compactionAt,
		ratio: usageRatio(assembled.totalTokens, contextWindow),
		pageMode: assembled.pageMode,
		pageTruncated: assembled.pageTruncated,
		budget,
	})

	return {
		messages: assembled.messages,
		system: assembled.system,
		budget,
		totalTokens: assembled.totalTokens,
	}
}

function resolveSelectionQuietly(
	settings = settingsStore.get(),
	conversation = conversationStore.get(),
): Selection | null {
	try {
		return resolveSelection(settings, conversation)
	} catch {
		return null
	}
}

/** Recompute the context meter (called on every conversation or settings change). */
export function refreshContext(): void {
	const selection = resolveSelectionQuietly()
	if (!selection) return
	void contextWindowFor(selection).then(() => publishContext(conversationStore.get(), settingsStore.get(), selection))
}

/* ------------------------------------------------------------------ actions */

export function newChat(): void {
	stopGeneration()
	const settings = settingsStore.get()
	const previous = conversationStore.get()
	const conversation = createConversation(previous.model ?? settings.defaultModel)
	// The page you are reading is the context of the sidebar, not of one transcript.
	conversation.attachments = previous.attachments
	commit(conversation)
	runStore.set({ status: 'idle' })
	refreshContext()
}

/**
 * Swap the transcript on screen for a saved one. The chat that was open stays in
 * history: it is flushed to the database before the switch, so picking an older chat
 * replaces the view without losing the current conversation.
 */
export async function openConversation(id: string): Promise<void> {
	if (conversationStore.get().id === id) return
	stopGeneration()
	// Persist the outgoing transcript before swapping the store, otherwise the pending
	// debounced save would fire against the conversation we are about to load.
	await flushPersistence()
	const stored = await loadConversation(id)
	if (!stored) return
	commit(stored)
	runStore.set({ status: 'idle' })
	// The live tab may belong to a different conversation; page tools still work from
	// the attachment, but `get_selection` must not read an unrelated page.
	tabIdStore.set(null)
	refreshContext()
}

export async function removeConversation(id: string): Promise<void> {
	await deleteConversation(id)
	if (conversationStore.get().id === id) newChat()
}

export function setModel(ref: ModelRef): void {
	const conversation = conversationStore.get()
	const updated: Conversation = { ...conversation, model: ref, updatedAt: now() }
	commit(updated)
	refreshContext()
}

export function setAttachment(attachment: PageAttachment | null): void {
	const conversation = conversationStore.get()
	const attachments = attachment ? [attachment] : []
	commit({ ...conversation, attachments, updatedAt: now() })
	refreshContext()
}

export function markAttachmentStale(): void {
	const conversation = conversationStore.get()
	const attachment = conversation.attachments[0]
	if (!attachment || attachment.stale) return
	commit({
		...conversation,
		attachments: [{ ...attachment, stale: true }],
		updatedAt: now(),
	})
}

export function stopGeneration(): void {
	activeController?.abort()
}

/* --------------------------------------------------------------- the model run */

const toolContext: ToolContext = {
	getAttachment: () => conversationStore.get().attachments[0] ?? null,
	getTabId: () => tabIdStore.get(),
	getConversationId: () => conversationStore.get().id,
	memory: memoryAccess,
	requestApproval,
}

interface RunOptions {
	/** True when retrying after a context overflow, so we do not loop forever. */
	retried?: boolean
}

async function runTurn(assistantId: string, options: RunOptions = {}): Promise<void> {
	const settings = normalizeSettings(settingsStore.get())
	const controller = new AbortController()
	activeController = controller
	const startedAt = now()
	let firstTokenAt: number | undefined
	let steps = 0
	let usage: Usage = { inputTokens: 0, outputTokens: 0, exact: false }

	runStore.set({ status: 'streaming', startedAt })

	let working = conversationStore.get()
	const assistantMessage = working.messages.find((message) => message.id === assistantId)
	if (!assistantMessage) {
		runStore.set({ status: 'idle' })
		return
	}
	// The user can open another conversation from history while this one streams. Once
	// that happens the run must not push its own transcript back into the panel: it
	// persists to the database instead, so the partial answer is still there later.
	const runConversationId = working.id
	const isCurrentConversation = () => conversationStore.get().id === runConversationId
	const commitRun = (conversation: Conversation) => {
		if (isCurrentConversation()) commit(conversation)
		else void saveConversation(conversation)
	}
	/** Set when this run hands control to a retried run, which owns the run state. */
	let delegated = false
	/** Declared here so `finally` closes the clients even when the run throws early. */
	let mcpBundle: McpToolBundle | null = null

	try {
		const selection = resolveSelection(settings, working)
		await contextWindowFor(selection)

		let context = publishContext(working, settings, selection)

		// Pre-flight compaction: summarize before spending a request that would overflow.
		if (context.totalTokens > context.budget.compactionAt) {
			const compacted = await summarize(working, settings, selection)
			working = compacted
			commitRun(working)
			context = publishContext(working, settings, selection)
		}

		const thinking = normalizeThinking(settings.modelDefaults.thinking, selection.provider.kind, selection.info)
		const model = await createLanguageModel(selection.provider, selection.ref.modelId, {
			temperature: settings.modelDefaults.temperature,
			thinking,
			info: selection.info,
		})

		const toolsEnabled = selection.info.capabilities.tools && hasEnabledTools(settings)
		const builtInTools = selection.info.capabilities.tools
			? buildTools(toolContext, enabledBuiltInTools(settings), settings.tools.autoApprove)
			: {}

		// MCP servers connect per turn: a server edited in Settings must never keep
		// serving yesterday's tools. Failures become warnings, never exceptions.
		mcpWarningsStore.set([])
		mcpBundle = selection.info.capabilities.tools
			? await buildMcpTools(toolContext, settings.tools.mcp, controller.signal)
			: null
		mcpWarningsStore.set(mcpBundle?.warnings ?? [])

		const tools: ToolSet = { ...builtInTools, ...(mcpBundle?.tools ?? {}) }
		if (Object.keys(tools).length === 0 && toolsEnabled) {
			// Nothing could be loaded, so the page index in the prompt cannot be acted on.
			context = publishContext(working, settings, selection, false)
		}

		const result = streamText({
			model,
			system: context.system,
			messages: context.messages,
			tools: Object.keys(tools).length > 0 ? tools : undefined,
			stopWhen: stepCountIs(settings.context.maxToolSteps),
			temperature: settings.modelDefaults.temperature,
			maxOutputTokens:
				settings.modelDefaults.maxOutputTokens ??
				selection.provider.maxOutputTokensOverride ??
				(selection.provider.kind === 'anthropic' ? Math.min(selection.info.maxOutputTokens, 8192) : undefined),
			providerOptions: buildProviderOptions(selection.provider, selection.ref.modelId, thinking, selection.info),
			abortSignal: controller.signal,
		})

		const parts: MessagePart[] = []

		const updateParts = () => {
			working = patchMessage(working, assistantId, (message) => ({
				...message,
				parts: [...parts],
				model: selection.ref,
			}))
			commitRun(working)
		}

		// Text deltas can arrive dozens of times per second. Committing each one would
		// re-render the whole markdown tree per token, so coalesce them; tool and status
		// events commit immediately because they change the message structure.
		let flushTimer: ReturnType<typeof setTimeout> | null = null
		let lastFlush = 0
		const COMMIT_INTERVAL_MS = 50

		const flushSoon = () => {
			if (flushTimer) return
			const elapsed = now() - lastFlush
			if (elapsed >= COMMIT_INTERVAL_MS) {
				lastFlush = now()
				updateParts()
				return
			}
			flushTimer = setTimeout(() => {
				flushTimer = null
				lastFlush = now()
				updateParts()
			}, COMMIT_INTERVAL_MS - elapsed)
		}

		const flushNow = () => {
			if (flushTimer) {
				clearTimeout(flushTimer)
				flushTimer = null
			}
			lastFlush = now()
			updateParts()
		}

		const appendText = (text: string) => {
			const last = parts[parts.length - 1]
			if (last?.type === 'text') last.text += text
			else parts.push({ type: 'text', text })
		}

		for await (const event of result.fullStream) {
			if (controller.signal.aborted) break
			switch (event.type) {
				case 'text-delta': {
					if (!firstTokenAt) firstTokenAt = now()
					appendText(event.text)
					flushSoon()
					break
				}
				case 'reasoning-delta': {
					if (!firstTokenAt) firstTokenAt = now()
					const last = parts[parts.length - 1]
					if (last?.type === 'reasoning') last.text += event.text
					else parts.push({ type: 'reasoning', text: event.text })
					flushSoon()
					break
				}
				case 'reasoning-end': {
					const last = parts[parts.length - 1]
					if (last?.type === 'reasoning' && startedAt) last.durationMs = now() - startedAt
					flushNow()
					break
				}
				case 'tool-call': {
					const info = mcpBundle?.info.get(event.toolName)
					parts.push({
						type: 'tool-call',
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						input: event.input,
						state: 'running',
						label: info?.label,
						server: info?.server,
					})
					flushNow()
					break
				}
				case 'tool-result': {
					const target = parts.find(
						(part): part is Extract<MessagePart, { type: 'tool-call' }> =>
							part.type === 'tool-call' && part.toolCallId === event.toolCallId,
					)
					if (target) {
						target.state = 'complete'
						target.output = event.output
					}
					flushNow()
					break
				}
				case 'tool-error': {
					const target = parts.find(
						(part): part is Extract<MessagePart, { type: 'tool-call' }> =>
							part.type === 'tool-call' && part.toolCallId === event.toolCallId,
					)
					if (target) {
						target.state = 'error'
						target.error = event.error instanceof Error ? event.error.message : String(event.error)
					}
					flushNow()
					break
				}
				case 'finish-step': {
					steps += 1
					usage = {
						inputTokens: (usage.inputTokens ?? 0) + (event.usage.inputTokens ?? 0),
						outputTokens: (usage.outputTokens ?? 0) + (event.usage.outputTokens ?? 0),
						reasoningTokens:
							(usage.reasoningTokens ?? 0) + (event.usage.outputTokenDetails?.reasoningTokens ?? 0),
						cachedInputTokens:
							(usage.cachedInputTokens ?? 0) + (event.usage.inputTokenDetails?.cacheReadTokens ?? 0),
						exact: event.usage.inputTokens !== undefined || event.usage.outputTokens !== undefined,
					}
					break
				}
				case 'error': {
					const error = toAppError(event.error)
					parts.push({ type: 'error', kind: error.kind, message: error.message, retryable: error.retryable })
					flushNow()
					break
				}
				default:
					break
			}
		}

		const finishedAt = now()
		if (flushTimer) {
			clearTimeout(flushTimer)
			flushTimer = null
		}
		const totalUsage = await Promise.resolve(result.totalUsage).catch(() => undefined)
		if (totalUsage) {
			const input = totalUsage.inputTokens
			const output = totalUsage.outputTokens
			if (typeof input === 'number' || typeof output === 'number') {
				usage = {
					inputTokens: input ?? 0,
					outputTokens: output ?? 0,
					reasoningTokens: totalUsage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens,
					cachedInputTokens: totalUsage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens,
					exact: true,
				}
			}
		}

		const aborted = controller.signal.aborted
		working = patchMessage(working, assistantId, (message) => ({
			...message,
			status: aborted ? 'aborted' : 'complete',
			usage,
			parts: [...parts],
			model: selection.ref,
		}))
		working = withTitle(working)
		commitRun(working)

		const duration = finishedAt - startedAt
		runStore.set({
			status: 'idle',
			startedAt,
			firstTokenAt: firstTokenAt ?? finishedAt,
			finishedAt,
			outputTokens: usage.outputTokens,
			tokensPerSecond: duration > 0 ? Math.round((usage.outputTokens / duration) * 1000) : undefined,
			steps,
		})

		if (isCurrentConversation()) {
			publishContext(working, settings, selection)
			const performed = await maybeAutoCompact(working, settings, selection, commitRun)
			if (performed) refreshContext()
		}
	} catch (error) {
		const appError = toAppError(error)

		if (appError.kind === 'context-overflow' && !options.retried) {
			try {
				const selection = resolveSelection(settings, working)
				working = await summarize(working, settings, selection)
				working = patchMessage(working, assistantId, (message) => ({
					...message,
					parts: [],
					status: 'streaming',
				}))
				commitRun(working)
				activeController = null
				delegated = true
				await runTurn(assistantId, { retried: true })
				return
			} catch {
				// Fall through and report the original error.
			}
		}

		if (appError.kind === 'aborted') {
			working = patchMessage(working, assistantId, (message) => ({ ...message, status: 'aborted' }))
		} else {
			working = patchMessage(working, assistantId, (message) => ({
				...message,
				status: 'error',
				parts: [
					...message.parts,
					{ type: 'error', kind: appError.kind, message: appError.message, retryable: appError.retryable },
				],
			}))
		}
		commitRun(working)
		runStore.set({
			status: 'idle',
			error:
				appError.kind === 'aborted'
					? undefined
					: { kind: appError.kind, message: appError.message, retryable: appError.retryable },
		})
		if (isCurrentConversation()) publishContext(working)
	} finally {
		if (activeController === controller) activeController = null
		if (!delegated && runStore.get().status === 'streaming') runStore.set({ status: 'idle' })
		// Session ids die with a turn; the next turn reconnects and re-lists tools.
		await mcpBundle?.close()
	}
}

function withTitle(conversation: Conversation): Conversation {
	if (conversation.title !== 'New chat') return conversation
	const firstUser = conversation.messages.find((message) => message.role === 'user')
	const text = firstUser ? messageText(firstUser) : ''
	if (!text) return conversation
	return { ...conversation, title: text.replace(/\s+/g, ' ').slice(0, 64) }
}

/* ------------------------------------------------------------------- prompts */

export async function submitPrompt(text: string, skillId?: string): Promise<void> {
	const content = text.trim()
	if (!content) return
	if (runStore.get().status !== 'idle') return

	const conversation = conversationStore.get()
	const userMessage: ChatMessage = {
		id: createId('msg'),
		role: 'user',
		parts: [{ type: 'text', text: content }],
		createdAt: now(),
		status: 'complete',
		skillId,
	}
	const assistantMessage: ChatMessage = {
		id: createId('msg'),
		role: 'assistant',
		parts: [],
		createdAt: now(),
		status: 'streaming',
	}
	const updated: Conversation = {
		...conversation,
		title: conversation.messages.length === 0 ? content.replace(/\s+/g, ' ').slice(0, 64) : conversation.title,
		messages: [...conversation.messages, userMessage, assistantMessage],
		updatedAt: now(),
	}
	commit(updated)
	await runTurn(assistantMessage.id)
}

/** Remove the last assistant answer and generate it again from the same user turn. */
export async function regenerate(): Promise<void> {
	if (runStore.get().status !== 'idle') return
	const conversation = conversationStore.get()
	const messages = [...conversation.messages]

	while (messages.length > 0 && messages[messages.length - 1]?.role !== 'assistant') messages.pop()
	if (messages.length === 0) return
	messages.pop()
	if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user') return

	const assistantMessage: ChatMessage = {
		id: createId('msg'),
		role: 'assistant',
		parts: [],
		createdAt: now(),
		status: 'streaming',
	}
	commit({ ...conversation, messages: [...messages, assistantMessage], updatedAt: now() })
	await runTurn(assistantMessage.id)
}

/* ----------------------------------------------------------------- compaction */

async function summarize(
	conversation: Conversation,
	settings = settingsStore.get(),
	selection = resolveSelection(settings, conversation),
): Promise<Conversation> {
	const plan = planCompaction(conversation.messages, settings.context.keepRecentTurns)
	if (!plan) {
		const micro = microCompact(conversation.messages)
		if (micro.savedTokens <= 0) return conversation
		return { ...conversation, messages: micro.messages, updatedAt: now() }
	}

	try {
		const model = await createLanguageModel(selection.provider, selection.ref.modelId, {
			temperature: 0.2,
			info: selection.info,
		})
		const prompt = buildSummaryPrompt(plan.toSummarize, conversation.summary?.text)
		const { text } = await generateText({ model, prompt, maxOutputTokens: 900 })
		const summary: ConversationSummary = {
			text: text.trim(),
			throughMessageId: plan.throughMessageId,
			createdAt: now(),
			tokenEstimate: estimateTokens(text),
		}
		return { ...conversation, summary, updatedAt: now() }
	} catch {
		// Summarization must never make things worse: fall back to the cheap pass.
		const micro = microCompact(conversation.messages)
		return { ...conversation, messages: micro.messages, updatedAt: now() }
	}
}

async function maybeAutoCompact(
	conversation: Conversation,
	settings: AppSettings,
	selection: Selection,
	persist: (conversation: Conversation) => void = commit,
): Promise<boolean> {
	const snapshot = contextStore.get()
	if (snapshot.usedTokens < snapshot.compactionAt) return false
	const compacted = await summarize(conversation, settings, selection)
	if (compacted === conversation) return false
	persist(compacted)
	return true
}

/** Compact on demand from the context panel. */
export async function compactNow(): Promise<void> {
	if (runStore.get().status !== 'idle') return
	const settings = settingsStore.get()
	const conversation = conversationStore.get()
	runStore.set({ status: 'compacting' })
	try {
		const selection = resolveSelection(settings, conversation)
		const compacted = await summarize(conversation, settings, selection)
		commit(compacted)
	} catch (error) {
		const appError = toAppError(error)
		runStore.set({
			status: 'idle',
			error: { kind: appError.kind, message: appError.message, retryable: appError.retryable },
		})
		return
	}
	runStore.set({ status: 'idle' })
	refreshContext()
}

/* ------------------------------------------------------------------ helpers */

/** Dismiss the error banner without starting a new run. */
export function clearRunError(): void {
	const state = runStore.get()
	if (!state.error) return
	runStore.set({ ...state, error: undefined })
}
