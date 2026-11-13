/**
 * The note that names the tab the user was looking at when they sent a prompt.
 *
 * A side panel cannot see the page beside it, so without this the model has no idea what
 * "what am I looking at?" or "is this a good deal?" refers to. The note is the cheap half of
 * a page: its title and URL, never its text. A page the chat already holds is named by its
 * handle instead, which turns "add that page" into one ordinary read.
 *
 * It rides the user turn and is stored with it. In the system prompt a tab switch would move
 * every token after it, which is exactly the cached prefix the append-only design protects.
 */

import type { PromptTab } from '../types'

/** Heading of the static note in the system prompt, beside `## MCP tools`. */
export const OPEN_TAB_HEADER = '## Open tab'

/** A title is a label; anything longer is a page that put its body text in its title. */
const MAX_TITLE_CHARS = 80
/** Long enough for a real address, short enough that a query string cannot arrive whole. */
const MAX_URL_CHARS = 300

/**
 * One line, with the brackets the note itself is built from removed.
 *
 * The title and URL are the page's, not ours, so a title carrying `]` could close the note
 * early and leave the rest of it looking like prose from the user.
 */
function oneLine(value: string, limit: number): string {
	const flat = value.replace(/\[|\]/g, ' ').replace(/\s+/g, ' ').trim()
	if (flat.length <= limit) return flat
	return `${flat.slice(0, limit).trimEnd()}…`
}

/**
 * The line the model reads in place of the page.
 *
 * One clause a small model can act on, naming the handle when the chat already holds the
 * page, so reading it needs no second question.
 */
export function renderPromptTab(tab: PromptTab): string {
	const title = oneLine(tab.title, MAX_TITLE_CHARS) || '(untitled)'
	const url = oneLine(tab.url, MAX_URL_CHARS)
	const place = tab.pageHandle ? `in this chat as ${tab.pageHandle}` : 'not in this chat'
	return `[Open tab: "${title}" ${url} — ${place}]`
}

/**
 * The paragraph that explains the note.
 *
 * Sent with every request, so it stays short and says only what the line itself cannot
 * carry: that the page is not in the conversation, and what to do about it. Without tools
 * the only honest option is to ask the user, so the `read_page` path is left out rather
 * than described and refused.
 */
export function describeOpenTabHint(options: { toolsEnabled: boolean }): string {
	const lines = [
		OPEN_TAB_HEADER,
		'A user message may carry a line naming the tab the user was looking at when they sent it. That page is not part of the conversation unless the line names its page handle.',
	]
	if (options.toolsEnabled) {
		lines.push(
			'When the line names a handle, read that page with `read_page`. Otherwise you know only its title and URL: `read_page` with that `url` opens the page and asks the user for permission to read it, or ask the user to add the page to the chat.',
		)
	} else {
		lines.push('You cannot open pages, so ask the user to add it to the chat when you need its contents.')
	}
	return lines.join('\n')
}

/**
 * Read a stored note back, dropping anything that would render a broken line.
 *
 * A chat is replayed verbatim on every later turn, so one malformed entry would otherwise be
 * sent for the rest of the conversation.
 */
export function normalizePromptTab(value: unknown): PromptTab | undefined {
	if (!value || typeof value !== 'object') return undefined
	const record = value as Partial<PromptTab>
	if (typeof record.title !== 'string' || typeof record.url !== 'string') return undefined
	const url = record.url.trim()
	if (!url) return undefined
	const handle = record.pageHandle
	return typeof handle === 'string' && handle.trim()
		? { title: record.title, url, pageHandle: handle.trim() }
		: { title: record.title, url }
}
