import type { ChatMessage } from '../types'

const CJK_RANGES =
	/[\u1100-\u11ff\u2e80-\u2eff\u3000-\u303f\u3040-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/

/**
 * Token estimate used for pre-flight budgeting and drafts.
 *
 * Providers report exact counts after a call, and those are always preferred. Before a
 * call we only have text, so use a deliberately simple model: CJK characters are roughly
 * one token each, other text is roughly four characters per token. Code and punctuation
 * skew this, hence the per-message overhead and the rounding.
 */
export function estimateTokens(text: string): number {
	if (!text) return 0
	let cjk = 0
	let other = 0
	for (const character of text) {
		if (CJK_RANGES.test(character)) cjk += 1
		else other += 1
	}
	return Math.ceil(cjk + other / 4)
}

/** Rough token cost of one message, including tool payloads and reasoning. */
export function estimateMessageTokens(message: ChatMessage): number {
	let total = 4
	for (const part of message.parts) {
		switch (part.type) {
			case 'text':
				total += estimateTokens(part.text)
				break
			case 'reasoning':
				total += estimateTokens(part.text)
				break
			case 'tool-call':
				total += estimateTokens(part.toolName) + estimateTokens(safeJson(part.input))
				if (part.output !== undefined) total += estimateTokens(safeJson(part.output))
				break
			case 'error':
				total += estimateTokens(part.message)
				break
			default:
				break
		}
	}
	return total
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
	return messages.reduce((total, message) => total + estimateMessageTokens(message), 0)
}

export function safeJson(value: unknown): string {
	if (typeof value === 'string') return value
	try {
		return JSON.stringify(value) ?? ''
	} catch {
		return String(value)
	}
}

export interface TokenBudget {
	contextWindow: number
	outputReserve: number
	/** Window available for system, page, summary and history. */
	usable: number
	compactionAt: number
}

/**
 * Split a window into what the prompt may use and what to keep back.
 */
export function createBudget(
	contextWindow: number,
	outputReserveRatio: number,
	compactionThreshold: number,
): TokenBudget {
	const available = Math.max(512, contextWindow)
	const outputReserve = Math.round(available * outputReserveRatio)
	return {
		contextWindow,
		outputReserve,
		usable: Math.max(512, available - outputReserve),
		compactionAt: Math.round(available * compactionThreshold),
	}
}
