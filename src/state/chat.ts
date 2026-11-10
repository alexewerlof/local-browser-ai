import { generateText, stepCountIs, streamText } from 'ai'
import type { ModelMessage, ToolSet } from 'ai'
import type {
	ChatMessage,
	AppSettings,
	Conversation,
	ConversationSummary,
	MessagePart,
	ModelRef,
	PageRefPart,
	PageSnapshot,
	ProviderSettings,
	Usage,
} from '../core/types'
import { Store } from '../core/store'
import { createId, now } from '../core/util'
import {
	enabledBuiltInTools,
	getProvider,
	hasEnabledTools,
	normalizeSettings,
	thinkingForModel,
} from '../core/settings'
import { buildContext, messageText, type ContextPart } from '../core/context/assembly'
import { buildSummaryPrompt, microCompact, planCompaction, usageRatio } from '../core/context/compaction'
import { createBudget, estimateTokens, type TokenBudget } from '../core/context/tokens'
import { buildTools, type ToolContext } from '../browser/tools'
import { getModelInfo, modelContextWindow, normalizeThinking, type ModelInfo } from '../providers/catalog'
import { AppError, toAppError } from '../providers/errors'
import { buildProviderOptions, createLanguageModel } from '../providers/registry'
import { settingsStore } from './settings'
import { requestApproval, recordToolTab, attachTabForTool } from './browser'
import { memoryAccess, memoryStore } from './memory'
import { buildMcpTools, enabledMcpServers, mcpWarningsStore, type McpToolBundle } from './mcp'
import { deleteConversation, loadConversation, loadPages, saveConversation, savePage } from './database'
import { clearOpenChatId, readOpenChatId, writeOpenChatId } from './panel-state'
import { bindPages, findAttachedPage, isPageReference, lastPageAddedStore, pagesStore, pendingPages } from './pages'
import {
	bindQueue,
	enqueuePrompt,
	flushQueuePersistence,
	loadQueueFor,
	queueStore,
	restorePromptFront,
	takeNextQueuedPrompt,
} from './queue'

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
		summary: null,
		contextTokens: 0,
	}
}

export const conversationStore = new Store<Conversation>(createConversation(null))
// The panel opens on a fresh chat, so its queue starts empty.
bindQueue(conversationStore.get().id)
export const runStore = new Store<RunState>({ status: 'idle' })

/**
 * Set when a run stopped because it reached the tool-step cap, not because the model was
 * done.
 *
 * The cap is per run, so continuing is a new run over the same answer: the counter starts
 * again from zero, and the tool calls that already ran are replayed from the transcript
 * rather than repeated.
 */
export const stepLimitStore = new Store<{ limit: number } | null>(null)
export const contextStore = new Store<ContextSnapshot>({
	parts: [],
	usedTokens: 0,
	contextWindow: 0,
	compactionAt: 0,
	ratio: 0,
	budget: null,
})

let activeController: AbortController | null = null
/** True while `drainQueue` owns the run loop, so a nested turn does not drain twice. */
let draining = false
/** True while the panel is swapping conversations; no run may start in that window. */
let switchingConversation = false
/**
 * Set when the user stops the loop with prompts still queued. The next prompt only
 * starts when they press Continue, so Stop is not a "run everything" button.
 */
export const queuePausedStore = new Store(false)

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
	await Promise.all([saveConversation(conversationStore.get()), flushQueuePersistence()])
}

/** Chat whose id is already in storage; the panel restores it on its next load. */
let rememberedChatId: string | null = null

/** Set the store; persistence is scheduled rather than awaited. */
export function commit(conversation: Conversation): void {
	conversationStore.set(conversation)
	// Which chat was on screen is not part of any chat, so it is written on its own. The
	// guard keeps the per-token commits of a run from writing the same id again.
	if (conversation.id !== rememberedChatId) {
		rememberedChatId = conversation.id
		void writeOpenChatId(conversation.id)
	}
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

/**
 * The work an answer has done so far.
 *
 * A continued answer adds a run to the one that hit the tool-step cap, so its numbers are
 * totals: the group above the answer describes the whole answer, not the last segment.
 */
function workOf(
	message: ChatMessage,
	durationMs: number,
	steps: number,
	continued = false,
): Pick<ChatMessage, 'steps' | 'durationMs'> {
	if (!continued) return { steps, durationMs }
	return {
		steps: (message.steps ?? 0) + steps,
		durationMs: (message.durationMs ?? 0) + durationMs,
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
	return { ref, provider, info: getModelInfo(ref.modelId) }
}

/** The window for one selection: the user's override, else the server's figure, else the catalog. */
function windowFor(selection: Selection): number {
	return modelContextWindow(selection.provider, selection.ref.modelId)
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
	const contextWindow = resolved ? windowFor(resolved) : 8192
	const lastUser = [...conversation.messages].reverse().find((message) => message.role === 'user')
	const query = lastUser ? messageText(lastUser) : ''
	// Must match the submit path: a model with tools enabled but none of them available
	// cannot act on a page outline either.
	const toolsEnabled = toolsEnabledOverride ?? hasEnabledTools(settings)
	const budget = createBudget(
		contextWindow,
		settings.context.outputReserveRatio,
		settings.context.compactionThreshold,
	)
	const assembled = buildContext({
		conversation,
		settings,
		budget,
		pages: pagesStore.get(),
		query,
		toolsEnabled,
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
	publishContext(conversationStore.get(), settingsStore.get(), selection)
}

/* ------------------------------------------------------------------ actions */

export function newChat(): void {
	stopGeneration()
	const settings = settingsStore.get()
	const previous = conversationStore.get()
	const conversation = createConversation(previous.model ?? settings.defaultModel)
	commit(conversation)
	// Pages belong to the chat that added them, so a new chat starts empty.
	bindPages([])
	// The outgoing chat keeps its own persisted queue; the new one starts empty.
	bindQueue(conversation.id)
	queuePausedStore.set(false)
	// A cap offer belongs to the answer that hit it, not to a chat opened afterwards.
	stepLimitStore.set(null)
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
	// Stop first, then swap. The aborted run's `finally` must not drain the old queue
	// into a conversation the panel is about to replace.
	switchingConversation = true
	try {
		stopGeneration()
		// Persist the outgoing transcript and queue before swapping the store, otherwise
		// the pending debounced save would fire against the conversation we are about to load.
		await flushPersistence()
		const stored = await loadConversation(id)
		if (!stored) return
		commit(stored)
		bindPages(await loadPages(id))
		await loadQueueFor(id)
		// A pause belongs to the run the user stopped, not to a chat they open later.
		queuePausedStore.set(false)
		// Same for a cap offer: it names answer on another transcript.
		stepLimitStore.set(null)
		runStore.set({ status: 'idle' })
		refreshContext()
	} finally {
		switchingConversation = false
	}
	// Pending prompts of the chat we just opened pick up where they left off.
	void drainQueue()
}

export async function removeConversation(id: string): Promise<void> {
	await deleteConversation(id)
	if (conversationStore.get().id === id) newChat()
}

/**
 * Open the chat the panel was showing when it closed.
 *
 * The side panel is destroyed on close, so the chat on screen has to be written down.
 * Restoring is deliberately quiet: the transcript, its pages and its queue come back,
 * but a queue that still holds prompts starts **parked**, so reopening the panel never
 * spends a request without the user asking for it.
 */
export async function restoreLastConversation(): Promise<void> {
	const id = await readOpenChatId()
	if (!id || conversationStore.get().id === id) return

	const stored = await loadConversation(id)
	if (!stored) {
		// Deleted in Settings or from another window; the fresh chat stands.
		await clearOpenChatId()
		return
	}

	commit(stored)
	// A chat's pages live beside it, not on it: without them the chips disappear and any
	// page that never reached a turn would be orphaned in the database.
	bindPages(await loadPages(id))
	await loadQueueFor(id)
	runStore.set({ status: 'idle' })
	// Park, do not drain: Continue is the user's decision, exactly like after a Stop.
	queuePausedStore.set(queueStore.get().length > 0)
	refreshContext()
}

export function setModel(ref: ModelRef): void {
	const conversation = conversationStore.get()
	const updated: Conversation = { ...conversation, model: ref, updatedAt: now() }
	commit(updated)
	refreshContext()
}

/**
 * Add a captured page to the chat. Its block waits for the next turn: the page list
 * shows it immediately, but the prompt only grows when a user message carries it.
 */
export async function appendPage(page: PageSnapshot): Promise<void> {
	await savePage(page)
	bindPages([...pagesStore.get(), page])
	// A search result is captured for the model only, so it must not open the page list.
	if (isPageReference(page)) lastPageAddedStore.set(page.id)
	refreshContext()
}

export function stopGeneration(): void {
	activeController?.abort()
	// Stopping means "stop the loop", not "skip this answer": keep the queue parked
	// until the user explicitly continues it. With nothing queued there is nothing to
	// pause, so the flag stays out of the way.
	if (queueStore.get().length > 0) queuePausedStore.set(true)
}

/** Resume the queue after a Stop (the Continue button). */
export function resumeQueue(): void {
	queuePausedStore.set(false)
	void drainQueue()
}

/* --------------------------------------------------------------- the model run */

const toolContext: ToolContext = {
	getPages: () => pagesStore.get(),
	getConversationId: () => conversationStore.get().id,
	findPageByUrl: (url) => findAttachedPage(url),
	memory: memoryAccess,
	requestApproval,
	onToolTab: recordToolTab,
	attachTab: attachTabForTool,
}

interface RunOptions {
	/** True when retrying after a context overflow, so we do not loop forever. */
	retried?: boolean
	/**
	 * True when continuing an answer that hit the tool-step cap: keep its parts and add to
	 * the same message instead of starting a second bubble.
	 */
	resume?: boolean
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
	// A new run answers the old offer: the banner must not survive into this one.
	stepLimitStore.set(null)

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

	// A continued answer keeps the tool calls it already ran: they are replayed from the
	// transcript, so the new segment adds to the same bubble instead of repeating them.
	if (options.resume) {
		working = patchMessage(working, assistantId, (message) => ({ ...message, status: 'streaming' }))
		commitRun(working)
	}

	try {
		const selection = resolveSelection(settings, working)

		let context = publishContext(working, settings, selection)

		// Pre-flight compaction: summarize before spending a request that would overflow.
		if (context.totalTokens > context.budget.compactionAt) {
			const compacted = await summarize(working, settings, selection)
			working = compacted
			commitRun(working)
			context = publishContext(working, settings, selection)
		}

		const thinking = normalizeThinking(
			thinkingForModel(selection.provider, selection.ref.modelId, settings.modelDefaults.thinking),
			selection.info,
		)
		const model = await createLanguageModel(selection.provider, selection.ref.modelId)

		const toolsEnabled = hasEnabledTools(settings)
		const builtInTools = buildTools(toolContext, enabledBuiltInTools(settings), settings.tools.autoApprove)

		// MCP servers connect per turn: a server edited in Settings must never keep
		// serving yesterday's tools. Failures become warnings, never exceptions.
		mcpWarningsStore.set([])
		mcpBundle = await buildMcpTools(toolContext, settings.tools.mcp, controller.signal)
		mcpWarningsStore.set(mcpBundle?.warnings ?? [])

		const tools: ToolSet = { ...builtInTools, ...(mcpBundle?.tools ?? {}) }
		if (Object.keys(tools).length === 0 && toolsEnabled) {
			// Nothing could be loaded, so the page index in the prompt cannot be acted on.
			context = publishContext(working, settings, selection, false)
		}

		const maxToolSteps = settings.context.maxToolSteps
		const result = streamText({
			model,
			system: context.system,
			messages: context.messages,
			tools: Object.keys(tools).length > 0 ? tools : undefined,
			stopWhen: stepCountIs(maxToolSteps),
			temperature: settings.modelDefaults.temperature,
			maxOutputTokens: settings.modelDefaults.maxOutputTokens ?? selection.provider.maxOutputTokensOverride,
			providerOptions: buildProviderOptions(selection.provider, selection.ref.modelId, thinking, selection.info),
			abortSignal: controller.signal,
		})

		const parts: MessagePart[] = options.resume ? [...assistantMessage.parts] : []
		/** Parts that were already on screen when this run started. */
		const seeded = parts.length

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
		const duration = finishedAt - startedAt

		working = patchMessage(working, assistantId, (message) => ({
			...message,
			status: aborted ? 'aborted' : 'complete',
			usage,
			parts: [...parts],
			model: selection.ref,
			...workOf(message, duration, steps, options.resume),
		}))
		working = withTitle(working)
		commitRun(working)

		runStore.set({
			status: 'idle',
			startedAt,
			firstTokenAt: firstTokenAt ?? finishedAt,
			finishedAt,
			outputTokens: usage.outputTokens,
			tokensPerSecond: duration > 0 ? Math.round((usage.outputTokens / duration) * 1000) : undefined,
			steps,
		})

		// "tool-calls" means the model asked for more tools and the cap stopped it there.
		// Ending the run silently is what makes a truncated answer look like a hang, so the
		// user is asked whether to spend another budget.
		const finishReason = await Promise.resolve(result.finishReason).catch(() => undefined)
		if (!aborted && finishReason === 'tool-calls') {
			if (parts.length > seeded) {
				stepLimitStore.set({ limit: maxToolSteps })
			} else {
				// A continuation that added nothing would re-offer the same banner for ever,
				// which reads as a button that does not work. Say what happened instead.
				runStore.set({
					status: 'idle',
					error: {
						kind: 'unsupported',
						message:
							'The model asked for tools again but returned nothing to run. Ask again, or raise the limit.',
						// Retrying would regenerate the whole answer and repeat every tool call,
						// so the message alone is the honest offer.
						retryable: false,
					},
				})
			}
		}

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
					steps: undefined,
					durationMs: undefined,
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
			working = patchMessage(working, assistantId, (message) => ({
				...message,
				status: 'aborted',
				...workOf(message, now() - startedAt, steps, options.resume),
			}))
		} else {
			working = patchMessage(working, assistantId, (message) => ({
				...message,
				status: 'error',
				...workOf(message, now() - startedAt, steps, options.resume),
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
		// A retried run owns the run state and drains itself; a run for a conversation
		// that is no longer on screen leaves its queue for when that chat is reopened.
		if (!delegated && isCurrentConversation() && !queuePausedStore.get()) void drainQueue()
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

/** Bind the pages that are waiting to the turn that is about to start. */
async function claimPendingPages(messageId: string): Promise<PageSnapshot[]> {
	const waiting = pendingPages()
	if (waiting.length === 0) return []
	const claimed = waiting.map((page) => ({ ...page, messageId }))
	await Promise.all(claimed.map(savePage))
	const byId = new Map(claimed.map((page) => [page.id, page]))
	bindPages(pagesStore.get().map((page) => byId.get(page.id) ?? page))
	return claimed
}

/** Append a user turn plus its empty assistant answer and run it. Assumes idle. */
async function startTurn(content: string, skillId?: string): Promise<void> {
	const conversation = conversationStore.get()
	const userMessageId = createId('msg')
	// Pages added since the last turn join this one. The block is written into the prompt
	// here, once, and never rewritten — that is what keeps the earlier turns cacheable.
	const claimed = await claimPendingPages(userMessageId)
	const userMessage: ChatMessage = {
		id: userMessageId,
		role: 'user',
		parts: [
			...claimed.map((page): PageRefPart => ({ type: 'page-ref', pageId: page.id })),
			{ type: 'text', text: content },
		],
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
	// Write the turn now rather than on the 400 ms debounce: if the panel is reloaded or
	// closed while the answer streams, the chat (and its queued prompts) must be there.
	await saveConversation(updated)
	await runTurn(assistantMessage.id)
}

/**
 * Send a prompt, or queue it when the agent is busy. The queue is drained by the run
 * loop once it goes idle, so the panel can accept the next message while a local model
 * is still thinking.
 */
export async function submitPrompt(text: string, skillId?: string): Promise<void> {
	const content = text.trim()
	if (!content) return
	// Typing and sending is an explicit intent to keep the loop moving.
	queuePausedStore.set(false)

	if (draining || runStore.get().status !== 'idle') {
		await enqueuePrompt(conversationStore.get().id, content, skillId)
		// The run may have gone idle while the queue write was in flight, and its own
		// drain has already passed. Ask for another pass; a live drain ignores this.
		void drainQueue()
		return
	}

	await startTurn(content, skillId)
}

/**
 * Start queued prompts one after another. Each prompt leaves the queue before its turn
 * begins, so a failing answer cannot replay the same entry forever.
 */
async function drainQueue(): Promise<void> {
	if (draining || switchingConversation || queuePausedStore.get()) return
	draining = true
	const conversationId = conversationStore.get().id
	try {
		while (
			!switchingConversation &&
			!queuePausedStore.get() &&
			conversationStore.get().id === conversationId &&
			runStore.get().status === 'idle'
		) {
			const next = await takeNextQueuedPrompt(conversationId)
			if (!next) break
			// The panel may have moved on while the write was in flight; the prompt still
			// belongs to its own conversation, so hand it back instead of starting it here.
			if (
				switchingConversation ||
				conversationStore.get().id !== conversationId ||
				runStore.get().status !== 'idle'
			) {
				await restorePromptFront(conversationId, next)
				break
			}
			await startTurn(next.text, next.skillId)
		}
	} finally {
		draining = false
	}
}

/** Remove the last assistant answer and generate it again from the same user turn. */
export async function regenerate(): Promise<void> {
	if (draining || runStore.get().status !== 'idle') return
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

/**
 * Continue an answer that stopped at the tool-step cap.
 *
 * A new run over the same message, so the counter starts again: if the limit is 6, the
 * user gets 6 more tool calls before being asked once more. The calls already made are
 * replayed from the transcript, so continuing costs no repeated work.
 */
export async function continueRun(): Promise<void> {
	stepLimitStore.set(null)
	if (draining || runStore.get().status !== 'idle') {
		// Only reachable if something else grabbed the run first. Say so rather than
		// dropping the click on the floor.
		runStore.set({
			status: 'idle',
			error: {
				kind: 'invalid-request',
				message: 'Another run is still finishing. Try again in a moment.',
				retryable: false,
			},
		})
		return
	}
	const conversation = conversationStore.get()
	const last = [...conversation.messages].reverse().find((message) => message.role === 'assistant')
	if (!last || last.status === 'aborted') return
	await runTurn(last.id, { resume: true })
}

/** Leave the answer as it stopped: the cap stands, and the banner goes away. */
export function cancelStepLimit(): void {
	stepLimitStore.set(null)
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
		const model = await createLanguageModel(selection.provider, selection.ref.modelId)
		const prompt = buildSummaryPrompt(plan.toSummarize, conversation.summary?.text)
		// A summary wants the most likely wording, not a lively one.
		const { text } = await generateText({ model, prompt, temperature: 0.2, maxOutputTokens: 900 })
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
	if (draining || runStore.get().status !== 'idle') return
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
	void drainQueue()
}

/* ------------------------------------------------------------------ helpers */

/** Dismiss the error banner without starting a new run. */
export function clearRunError(): void {
	const state = runStore.get()
	if (!state.error) return
	runStore.set({ ...state, error: undefined })
}
