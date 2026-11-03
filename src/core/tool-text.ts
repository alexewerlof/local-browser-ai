/**
 * Ceiling for one tool result. A tool result is paid for once and the model can always
 * ask for more, so it is cheaper to clip than to send everything.
 */
export const MAX_TOOL_CHARS = 4_000

export function clipToolText(text: string, limit = MAX_TOOL_CHARS): { text: string; truncated: boolean } {
	if (text.length <= limit) return { text, truncated: false }
	return { text: `${text.slice(0, limit)}\n\n… (truncated)`, truncated: true }
}
