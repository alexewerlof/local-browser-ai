/**
 * Pure helpers for MCP servers: URLs, header lines, model-facing tool names, result
 * formatting and error text. Nothing here touches the network or the AI SDK, so the
 * settings schema, the options page and the runtime can all share it.
 */

import { clipToolText, MAX_TOOL_CHARS } from './tool-text'

/** OpenAI-compatible providers reject names outside this set, so every MCP tool is renamed. */
const MAX_TOOL_NAME = 64
const TOOL_NAME_PREFIX = 'mcp'
/** RFC 7230 token characters. */
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const MAX_LABEL_SLUG = 16
const MAX_TOOL_SLUG = 32

export function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value.trim())
		return url.protocol === 'http:' || url.protocol === 'https:'
	} catch {
		return false
	}
}

/**
 * Identity of a discovered catalog entry. Including the URL and headers means editing
 * either one invalidates cached tools instead of showing results from the old server.
 */
export function mcpServerKey(server: { id: string; url: string; headers?: Record<string, string> }): string {
	const headers = Object.entries(server.headers ?? {})
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([name, value]) => `${name}:${value}`)
		.join('\n')
	return `${server.id}\n${server.url.trim()}\n${headers}`
}

function slug(text: string, limit: number): string {
	const cleaned = text
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '_')
		.replace(/^_+|_+$/g, '')
	return cleaned.slice(0, limit) || 'tool'
}

/** Stable short hash, used to disambiguate names that collide after slugging. */
function shortHash(text: string): string {
	let hash = 5381
	for (let index = 0; index < text.length; index += 1) {
		hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0
	}
	return hash.toString(36).padStart(4, '0').slice(-4)
}

/** The model-facing name for one MCP tool before collisions are resolved. */
export function mcpToolName(serverLabel: string, toolName: string): string {
	const server = slug(serverLabel, MAX_LABEL_SLUG)
	const prefix = `${TOOL_NAME_PREFIX}_${server}_`
	return `${prefix}${slug(toolName, Math.min(MAX_TOOL_SLUG, MAX_TOOL_NAME - prefix.length))}`.slice(0, MAX_TOOL_NAME)
}

export interface McpToolIdentity {
	serverId: string
	serverLabel: string
	toolName: string
}

/** Map from `<serverId>\n<toolName>` to the unique model-facing tool name. */
export function assignToolNames(identities: McpToolIdentity[]): Map<string, string> {
	const used = new Set<string>()
	const names = new Map<string, string>()

	for (const identity of identities) {
		const base = mcpToolName(identity.serverLabel, identity.toolName)
		let name = base
		if (used.has(name)) {
			// Two servers with the same label, or two tools that slug identically.
			const suffix = `_${shortHash(`${identity.serverId}\n${identity.toolName}`)}`
			name = `${base.slice(0, MAX_TOOL_NAME - suffix.length)}${suffix}`
			let counter = 2
			while (used.has(name)) {
				const tail = `${suffix}_${counter}`
				name = `${base.slice(0, MAX_TOOL_NAME - tail.length)}${tail}`
				counter += 1
			}
		}
		used.add(name)
		names.set(toolKey(identity.serverId, identity.toolName), name)
	}

	return names
}

/** Lookup key used by `assignToolNames`. */
export function toolKey(serverId: string, toolName: string): string {
	return `${serverId}\n${toolName}`
}

/**
 * MCP servers may omit `type`, or send a schema the provider rejects. Tool inputs are
 * always objects, so fill that in and leave the rest of the server's schema alone.
 */
export function normalizeToolSchema(schema: unknown): Record<string, unknown> {
	if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
		return { type: 'object', properties: {} }
	}
	const record = schema as Record<string, unknown>
	if (record.type) return record
	return {
		...record,
		type: 'object',
		properties: record.properties && typeof record.properties === 'object' ? record.properties : {},
	}
}

export interface FormattedMcpResult {
	text: string
	truncated: boolean
	isError: boolean
}

type ContentBlock = {
	type?: string
	text?: string
	mimeType?: string
	data?: string
	resource?: { uri?: string; mimeType?: string; text?: string; blob?: string }
}

/** Turn an MCP `CallToolResult` into text the model can read; never inline base64. */
export function formatMcpResult(result: unknown, limit = MAX_TOOL_CHARS): FormattedMcpResult {
	const record = result && typeof result === 'object' ? (result as Record<string, unknown>) : {}
	const isError = record.isError === true
	const blocks = Array.isArray(record.content) ? (record.content as ContentBlock[]) : []

	const pieces: string[] = []
	for (const block of blocks) {
		const text = describeContent(block)
		if (text) pieces.push(text)
	}

	// Some servers answer only in structured content; stringify it rather than dropping it.
	if (pieces.length === 0 && record.structuredContent !== undefined) {
		pieces.push(safeJson(record.structuredContent))
	}

	const body = pieces.join('\n\n').trim()
	const clipped = clipToolText(body || '(The tool returned no output.)', limit)
	return { text: clipped.text, truncated: clipped.truncated, isError }
}

function describeContent(block: ContentBlock): string {
	switch (block.type) {
		case 'text':
			return block.text ?? ''
		case 'resource': {
			const resource = block.resource
			if (resource?.text !== undefined) return resource.text
			const uri = resource?.uri ?? 'unknown'
			const mime = resource?.mimeType ? `, ${resource.mimeType}` : ''
			return `[binary resource: ${uri}${mime}]`
		}
		case 'image':
			return `[image${block.mimeType ? `: ${block.mimeType}` : ''}]`
		case 'audio':
			return `[audio${block.mimeType ? `: ${block.mimeType}` : ''}]`
		case undefined:
			return ''
		default:
			return `[${block.type} content]`
	}
}

function safeJson(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2)
	} catch {
		return String(value)
	}
}

export interface ParsedHeaders {
	headers: Record<string, string>
	errors: string[]
}

/** Parse the options page's `Name: value` lines. Blank lines and `#` comments are skipped. */
export function parseHeaderLines(text: string): ParsedHeaders {
	const headers: Record<string, string> = {}
	const errors: string[] = []

	for (const [index, raw] of text.split(/\r?\n/).entries()) {
		const line = raw.trim()
		if (!line || line.startsWith('#')) continue

		const colon = line.indexOf(':')
		if (colon <= 0) {
			errors.push(`Line ${index + 1}: expected "Name: value".`)
			continue
		}

		const name = line.slice(0, colon).trim()
		const value = line.slice(colon + 1).trim()
		if (!HEADER_NAME_PATTERN.test(name)) {
			errors.push(`Line ${index + 1}: "${name}" is not a valid header name.`)
			continue
		}
		if (/[\r\n]/.test(value)) {
			errors.push(`Line ${index + 1}: a header value cannot contain a line break.`)
			continue
		}

		headers[name] = value
	}

	return { headers, errors }
}

export function formatHeaderLines(headers: Record<string, string> | undefined): string {
	return Object.entries(headers ?? {})
		.map(([name, value]) => `${name}: ${value}`)
		.join('\n')
}

/** One-line explanation for a failed connection or tool call, safe to show in the UI. */
export function describeMcpError(error: unknown): string {
	if (error instanceof DOMException && error.name === 'AbortError') return 'The request was cancelled.'
	if (error instanceof Error && error.name === 'AbortError') return 'The request was cancelled.'

	const status = mcpErrorStatus(error)
	if (status !== undefined) {
		if (status === 401 || status === 403) {
			return `The server rejected the credentials (HTTP ${status}). Check the headers.`
		}
		if (status === 404) return 'The MCP endpoint was not found (HTTP 404). Check the URL.'
		if (status === 429) return 'The server is rate limiting requests (HTTP 429).'
		if (status >= 500) return `The server failed (HTTP ${status}).`
		return `The server rejected the request (HTTP ${status}).`
	}

	if (error instanceof TypeError) {
		return 'Could not reach the MCP server. Check that it is running, and that the extension has access to its host.'
	}

	const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
	return message.trim().slice(0, 200) || 'The MCP server failed.'
}

function statusOf(error: unknown): number | undefined {
	if (!error || typeof error !== 'object') return undefined
	const candidate = error as { statusCode?: unknown; status?: unknown }
	if (typeof candidate.statusCode === 'number') return candidate.statusCode
	if (typeof candidate.status === 'number') return candidate.status
	return undefined
}

/** The HTTP status carried by an MCP client error, when it has one. */
export function mcpErrorStatus(error: unknown): number | undefined {
	return statusOf(error)
}
