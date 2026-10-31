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
		description: 'List the headings of the attached page.',
		requiresApproval: false,
	},
	{
		id: 'read_page_section',
		label: 'Read page section',
		description: 'Read one section of the attached page by heading.',
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

const MAX_TOOL_CHARS = 12_000

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
				'Read the attached page as markdown. Use this when the conversation does not already contain the part of the page you need. Optionally pass a section heading to read only that part.',
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
			description: 'List the headings of the attached page with their level.',
			inputSchema: z.object({}),
			execute: async () => {
				const attachment = requireAttachment(context)
				return {
					title: attachment.title,
					url: attachment.url,
					outline: attachment.outline.map((entry) => ({
						level: entry.level,
						heading: entry.text,
					})),
				}
			},
		})
	}

	if (enabled.has('read_page_section')) {
		tools.read_page_section = tool({
			description:
				'Read one section of the attached page. Pass a heading from the outline (or a distinctive part of it).',
			inputSchema: z.object({
				heading: z.string().describe('Heading text of the section to read.'),
			}),
			execute: async ({ heading }) => {
				const attachment = requireAttachment(context)
				const section = readSection(attachment, heading)
				if (!section) {
					return {
						found: false,
						message: `No section matching "${heading}". Available headings: ${attachment.outline
							.map((entry) => entry.text)
							.slice(0, 20)
							.join(' | ')}`,
					}
				}
				const limited = clip(section.text)
				return {
					found: true,
					heading: section.heading,
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
