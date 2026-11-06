/**
 * A prompt accepted in the address bar, waiting for the panel to open and send it.
 *
 * Pure helpers only: the worker writes the entry, the panel reads it, and neither may
 * trust what the other stored (`storage.session` survives a worker restart but not a
 * shape change). Nothing here touches `chrome.*`.
 */

export interface OmniboxPrompt {
	/** The text the user typed after the keyword. */
	text: string
	/** Tab the entry was accepted on, captured because the omnibox hands over no tab. */
	tabId?: number
	createdAt: number
}

/**
 * An omnibox line is one press of Enter, not a document: a prompt past this is almost
 * certainly a paste that meant to land in the composer.
 */
export const MAX_OMNIBOX_PROMPT_CHARS = 4000

/**
 * How long an entry stays take-able. It exists to survive the panel's boot, not the
 * day: an entry left behind must not hijack the next panel the user opens by hand.
 */
export const OMNIBOX_PROMPT_TTL_MS = 120_000

/**
 * The omnibox description row, shown while the keyword is active. Chrome forgets it on
 * every worker start, so the worker sets it again each time it boots.
 */
export const OMNIBOX_SUGGESTION = 'Ask Local Browser AI about this page'

/** The prompt text, trimmed and capped, or `null` when there is nothing to send. */
export function normalizeOmniboxPrompt(text: unknown): string | null {
	if (typeof text !== 'string') return null
	const trimmed = text.trim()
	if (!trimmed) return null
	return trimmed.slice(0, MAX_OMNIBOX_PROMPT_CHARS)
}

/**
 * Read a stored entry, or `null` when it is malformed or older than the TTL.
 *
 * A stale entry is reported as absent rather than deleted here: the caller already
 * clears the storage key when it takes one, and this stays a pure read.
 */
export function readPendingOmniboxPrompt(value: unknown, at = Date.now()): OmniboxPrompt | null {
	if (typeof value !== 'object' || value === null) return null
	const entry = value as Partial<OmniboxPrompt>
	const text = normalizeOmniboxPrompt(entry.text)
	if (!text) return null
	if (typeof entry.createdAt !== 'number' || !Number.isFinite(entry.createdAt)) return null
	if (at - entry.createdAt > OMNIBOX_PROMPT_TTL_MS) return null
	const prompt: OmniboxPrompt = { text, createdAt: entry.createdAt }
	if (typeof entry.tabId === 'number' && Number.isInteger(entry.tabId)) prompt.tabId = entry.tabId
	return prompt
}
