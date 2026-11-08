import { formatDuration, formatTokens } from './util'
import type { ChatMessage, MessagePart, ReasoningPart, ToolCallPart } from './types'

/** A part that belongs to a step rather than to the answer. */
export type StepPart = ReasoningPart | ToolCallPart

/**
 * The parts a step leaves in the transcript: the model's reasoning, and the tool calls it
 * asked for. Text is the answer and stays outside the group, so a turn reads as its steps
 * followed by the answer they produced.
 */
export function isStepPart(part: MessagePart): part is StepPart {
	return part.type === 'reasoning' || part.type === 'tool-call'
}

/** The step parts of one answer, in transcript order. */
export function stepParts(parts: MessagePart[]): StepPart[] {
	return parts.filter(isStepPart)
}

/**
 * How many steps an answer took.
 *
 * The run counts them from the provider's `finish-step` events and stores that count with
 * the answer, because the transcript cannot always recover it: three tool calls in one step
 * and three one-call steps leave the same parts. An answer saved before the count existed
 * falls back to the number of tool-call runs, which is the work its rows show.
 */
export function countSteps(message: ChatMessage): number {
	if (typeof message.steps === 'number') return message.steps
	if (!message.parts.some(isStepPart)) return 0
	return Math.max(1, countToolCallRuns(message.parts))
}

/** The line the finished group collapses into, e.g. `Completed 2 steps in 12.4 s · ~1.2k tokens`. */
export function describeSteps(message: ChatMessage): string {
	const count = countSteps(message)
	const label = `Completed ${count} ${count === 1 ? 'step' : 'steps'}`
	const duration = message.durationMs ? ` in ${formatDuration(message.durationMs)}` : ''
	const outputTokens = message.usage?.outputTokens
	if (!outputTokens) return label + duration
	const approx = message.usage?.exact ? '' : '~'
	return `${label}${duration} · ${approx}${formatTokens(outputTokens)} tokens`
}

function countToolCallRuns(parts: MessagePart[]): number {
	let runs = 0
	let inRun = false
	for (const part of parts) {
		if (part.type === 'tool-call') {
			if (!inRun) runs += 1
			inRun = true
			continue
		}
		// Reasoning never follows the tools of its own step, so it opens the next one.
		inRun = false
	}
	return runs
}
