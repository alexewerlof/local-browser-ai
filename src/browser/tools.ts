import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { PageAttachment } from '../core/types'
import { openUrl, getTabSelection } from './client'
import { findInAttachment, readSection } from './extract/sections'

export interface ToolContext {
	getAttachment(): PageAttachment | null
	getTabId(): number | null
	/**
	 * Ask the user to approve a tool call. Resolves false when denied or aborted.
	 * The pending request is keyed by `toolCallId` so the UI can render it on the call card.
	 */
	requestApproval(toolCallId: string, toolName: string, input: unknown, signal?: AbortSignal): Promise<boolean>
}

export interface ToolDefinition {
	id: string
	label: string
	description: string
	requiresApproval: boolean
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
	{
		id: 'read_attached_page',
		label: 'Read attached page',
		description: 'Read the cleaned markdown of the page the user attached.',
		requiresApproval: false,
	},
	{
		id: 'get_page_outline',
		label: 'Page outline',
		description: 'List the headings of the attached page, with their size.',
		requiresApproval: false,
	},
	{
		id: 'read_page_section',
		label: 'Read page section',
		description: 'Read one or more sections of the attached page by heading.',
		requiresApproval: false,
	},
	{
		id: 'find_in_page',
		label: 'Find in page',
		description: 'Search the attached page for a phrase and return matching snippets.',
		requiresApproval: false,
	},
	{
		id: 'get_selection',
		label: 'Read current selection',
		description: 'Read the text currently selected in the browser tab.',
		requiresApproval: false,
	},
	{
		id: 'open_url',
		label: 'Open link in new tab',
		description: 'Open an http(s) URL from the answer in a new browser tab.',
		requiresApproval: true,
	},
]

/** Default ceiling for one tool result. Smaller than the prompt it replaced, because
 * a tool result is paid for once and the model can always ask for more. */
const MAX_TOOL_CHARS = 4_000

function clip(text: string, limit = MAX_TOOL_CHARS): { text: string; truncated: boolean } {
	if (text.length <= limit) return { text, truncated: false }
	return { text: `${text.slice(0, limit)}\n\n… (truncated)`, truncated: true }
}

function requireAttachment(context: ToolContext): PageAttachment {
	const attachment = context.getAttachment()
	if (!attachment) {
		throw new Error('No page is attached. Ask the user to attach the current tab first.')
	}
	return attachment
}

/** Build the tool set the model may call for this turn. */
export function buildTools(context: ToolContext, enabledIds: string[]): ToolSet {
	const enabled = new Set(enabledIds)
	const tools: ToolSet = {}

	if (enabled.has('read_attached_page')) {
		tools.read_attached_page = tool({
			description:
				'Read the attached page as markdown, limited to 4000 characters by default. Prefer `get_page_outline` plus `read_page_section`; only read the whole page when the question spans all of it. Pass a section heading to read one section.',
			inputSchema: z.object({
				section: z.string().optional().describe('Optional heading to read instead of the whole page.'),
				maxChars: z.number().int().min(500).max(20_000).optional(),
			}),
			execute: async ({ section, maxChars }) => {
				const attachment = requireAttachment(context)
				const body = section
					? (readSection(attachment, section)?.text ?? `No section matching "${section}" was found.`)
					: attachment.markdown
				const limited = clip(body, maxChars ?? MAX_TOOL_CHARS)
				return {
					url: attachment.url,
					title: attachment.title,
					text: limited.text,
					truncated: limited.truncated,
				}
			},
		})
	}

	if (enabled.has('get_page_outline')) {
		tools.get_page_outline = tool({
			description:
				'List the headings of the attached page with their level, id and approximate token size. Use the id or heading with `read_page_section`.',
			inputSchema: z.object({}),
			execute: async () => {
				const attachment = requireAttachment(context)
				const sizes = new Map<string, number>()
				for (const chunk of attachment.chunks) {
					sizes.set(chunk.heading, (sizes.get(chunk.heading) ?? 0) + chunk.text.length)
				}
				return {
					title: attachment.title,
					url: attachment.url,
					outline: attachment.outline.map((entry) => ({
						id: entry.id,
						level: entry.level,
						heading: entry.text,
						chars: sizes.get(entry.text) ?? 0,
					})),
				}
			},
		})
	}

	if (enabled.has('read_page_section')) {
		tools.read_page_section = tool({
			description:
				'Read one or more sections of the attached page. Pass headings or outline ids. Results are capped, so read the sections you need rather than the whole page.',
			inputSchema: z.object({
				heading: z.string().optional().describe('Heading text or outline id of the section to read.'),
				headings: z
					.array(z.string())
					.max(8)
					.optional()
					.describe('Several headings or ids to read in one call.'),
				maxChars: z.number().int().min(500).max(20_000).optional(),
			}),
			execute: async ({ heading, headings, maxChars }) => {
				const attachment = requireAttachment(context)
				const requested = [...(heading ? [heading] : []), ...(headings ?? [])]
				if (requested.length === 0) {
					return {
						found: false,
						message: 'Pass `heading` or `headings`. Use `get_page_outline` to see what is available.',
					}
				}

				const limit = maxChars ?? MAX_TOOL_CHARS
				const found: Array<{ id: string; heading: string; text: string }> = []
				const missing: string[] = []
				for (const reference of requested) {
					const section = readSection(attachment, reference)
					if (!section) {
						missing.push(reference)
						continue
					}
					const id = attachment.outline.find((entry) => entry.text === section.heading)?.id ?? ''
					found.push({ id, heading: section.heading, text: section.text })
				}

				if (found.length === 0) {
					return {
						found: false,
						message: `No section matching ${missing.map((value) => `"${value}"`).join(', ')}. Available headings: ${attachment.outline
							.map((entry) => entry.text)
							.slice(0, 20)
							.join(' | ')}`,
					}
				}

				const limited = clip(
					found.map((section) => `## ${section.heading}\n${section.text}`).join('\n\n'),
					limit,
				)
				return {
					found: true,
					heading: found[0]?.heading ?? '',
					// Only metadata: the text is in `text`, which is capped above. Returning the
					// full text here as well would silently double the tool result.
					sections: found.map((section) => ({
						id: section.id,
						heading: section.heading,
						chars: section.text.length,
					})),
					missing,
					text: limited.text,
					truncated: limited.truncated,
				}
			},
		})
	}

	if (enabled.has('find_in_page')) {
		tools.find_in_page = tool({
			description: 'Search the attached page for a literal phrase. Returns short snippets with their section.',
			inputSchema: z.object({
				query: z.string().min(1).describe('Text to find on the page.'),
				limit: z.number().int().min(1).max(10).optional(),
			}),
			execute: async ({ query, limit }) => {
				const attachment = requireAttachment(context)
				const matches = findInAttachment(attachment, query, limit ?? 5)
				return { query, count: matches.length, matches }
			},
		})
	}

	if (enabled.has('get_selection')) {
		tools.get_selection = tool({
			description: 'Read the text the user has selected in the browser tab right now.',
			inputSchema: z.object({}),
			execute: async () => {
				const tabId = context.getTabId()
				if (tabId === null) return { text: '', message: 'No tab is attached.' }
				try {
					const text = await getTabSelection(tabId)
					return { text: text || '', message: text ? undefined : 'Nothing is selected.' }
				} catch (error) {
					return { text: '', message: error instanceof Error ? error.message : String(error) }
				}
			},
		})
	}

	if (enabled.has('open_url')) {
		tools.open_url = tool({
			description:
				'Open an http(s) link in a new browser tab. Use this when the user asks to open or show a page. Never invent URLs.',
			inputSchema: z.object({
				url: z.string().url().describe('Absolute http or https URL.'),
				newWindow: z.boolean().optional().describe('Open in a separate window instead of a tab.'),
			}),
			execute: async ({ url, newWindow }, options) => {
				if (!/^https?:\/\//i.test(url)) {
					return { opened: false, reason: 'Only http and https URLs can be opened.' }
				}
				const approved = await context.requestApproval(
					options.toolCallId,
					'open_url',
					{ url, newWindow: Boolean(newWindow) },
					options.abortSignal,
				)
				if (!approved) return { opened: false, reason: 'The user declined to open the link.' }
				await openUrl(url, Boolean(newWindow))
				return { opened: true, url }
			},
		})
	}

	return tools
}
