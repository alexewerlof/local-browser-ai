import type { ChatMessage } from '../types'
import { estimateMessagesTokens, estimateTokens } from './tokens'

export interface CompactionPlan {
	toSummarize: ChatMessage[]
	keep: ChatMessage[]
	/** Id of the last summarized message; the summary covers everything up to it. */
	throughMessageId: string
}

/** Group messages into turns that start at each user message. */
function turnStarts(messages: ChatMessage[]): number[] {
	const starts: number[] = []
	messages.forEach((message, index) => {
		if (message.role === 'user') starts.push(index)
	})
	if (starts.length === 0 || starts[0] !== 0) starts.unshift(0)
	return starts
}

/**
 * Decide which messages a macro-compaction should replace with a summary.
 * Always keeps at least the most recent turn, even if it alone exceeds the target.
 */
export function planCompaction(messages: ChatMessage[], keepRecentTurns: number): CompactionPlan | null {
	const starts = turnStarts(messages)
	if (starts.length <= keepRecentTurns) return null

	const keepFromIndex = starts[starts.length - keepRecentTurns] ?? starts[0] ?? 0
	if (keepFromIndex <= 0) return null

	const toSummarize = messages.slice(0, keepFromIndex)
	const keep = messages.slice(keepFromIndex)
	const through = toSummarize[toSummarize.length - 1]
	if (!through) return null

	return { toSummarize, keep, throughMessageId: through.id }
}

/**
 * Cheap compaction that keeps every message but shrinks what it contributes:
 * finished reasoning traces are dropped and old tool output is truncated.
 */
export function microCompact(messages: ChatMessage[]): { messages: ChatMessage[]; savedTokens: number } {
	const before = estimateMessagesTokens(messages)
	// Only the current turn keeps its reasoning and full tool output; everything older
	// is already represented in the visible answer.
	const lastUserIndex = messages.reduce(
		(last, message, index) => (message.role === 'user' ? index : last),
		messages.length,
	)

	const compacted = messages.map((message, index) => {
		const isRecent = index >= lastUserIndex
		const parts = message.parts.flatMap((part) => {
			if (part.type === 'reasoning' && !isRecent) return []
			if (part.type === 'tool-call' && part.output !== undefined && !isRecent) {
				const rendered = typeof part.output === 'string' ? part.output : JSON.stringify(part.output)
				if (rendered.length > 600) {
					return [
						{
							...part,
							output: `${rendered.slice(0, 600)}… (truncated during compaction)`,
						},
					]
				}
			}
			return [part]
		})
		return { ...message, parts }
	})

	return { messages: compacted, savedTokens: Math.max(0, before - estimateMessagesTokens(compacted)) }
}

/** The prompt used to summarize the oldest turns. */
export function buildSummaryPrompt(messages: ChatMessage[], previousSummary?: string): string {
	const transcript = messages
		.map((message) => {
			const text = message.parts
				.map((part) => {
					if (part.type === 'text') return part.text
					if (part.type === 'reasoning') return ''
					if (part.type === 'tool-call') return `[tool ${part.toolName}]`
					if (part.type === 'error') return `[error: ${part.message}]`
					return ''
				})
				.filter(Boolean)
				.join('\n')
			if (!text.trim()) return ''
			return `${message.role.toUpperCase()}: ${text.slice(0, 2000)}`
		})
		.filter(Boolean)
		.join('\n\n')

	const budgeted = transcript.slice(0, 48_000)

	return [
		'You are compacting a chat transcript so the conversation can continue in a smaller context window.',
		'Write a dense summary that a future assistant can use to continue the work without the original messages.',
		'Preserve, in this order of importance:',
		'1. What the user is trying to accomplish and any constraints they stated.',
		'2. Decisions made and conclusions reached, with the reasoning that justifies them.',
		'3. Concrete facts gathered from the attached page, including section names, numbers and URLs.',
		'4. Tool findings that are still relevant.',
		'5. Open questions and the next step.',
		'Drop pleasantries, repeated content and failed attempts that led nowhere.',
		'Write at most 350 words. Output only the summary, no preamble.',
		previousSummary
			? `\nAn earlier summary already exists; merge it with the transcript below:\n${previousSummary}`
			: '',
		`\nTranscript:\n${budgeted}`,
	]
		.filter(Boolean)
		.join('\n')
}

/** How much of the window the assembled context uses, clamped to 0..1. */
export function usageRatio(usedTokens: number, contextWindow: number): number {
	if (contextWindow <= 0) return 0
	return Math.min(1, Math.max(0, usedTokens / contextWindow))
}
