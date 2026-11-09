/**
 * MCP runtime. The side panel is the only place that talks to a model, and it is also
 * the only place that talks to MCP servers: the service worker cannot fetch on the
 * user's behalf without extra permissions, and MCP is HTTP-only here (there is no
 * process to spawn for stdio servers).
 *
 * Discovery is cached per server for the settings UI; each chat turn connects fresh and
 * closes its clients when the turn ends, so an edited server never serves stale tools.
 */

import { createMCPClient, type MCPClient } from '@ai-sdk/mcp'
import { jsonSchema, tool, type JSONSchema7, type ToolSet } from 'ai'
import type { McpServerSettings } from '../core/types'
import {
	assignToolNames,
	describeMcpError,
	formatMcpResult,
	mcpErrorStatus,
	mcpServerKey,
	normalizeToolSchema,
	toolKey,
} from '../core/mcp'
import { Store } from '../core/store'
import { isMcpToolAutoApproved, isMcpToolEnabled } from '../core/tool-selection'

/** How long connecting and listing tools may take before the server counts as down. */
const CONNECT_TIMEOUT_MS = 10_000
/** Guard against a server that never stops paginating `tools/list`. */
const MAX_TOOL_PAGES = 20

export interface McpDiscoveredTool {
	name: string
	title?: string
	description?: string
	inputSchema: unknown
	readOnly: boolean
}

export type McpCatalogStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface McpCatalogEntry {
	status: McpCatalogStatus
	tools: McpDiscoveredTool[]
	error?: string
	checkedAt?: number
}

/** Keyed by `mcpServerKey`, so an edited URL or header set invalidates its entry. */
export const mcpCatalogStore = new Store<Record<string, McpCatalogEntry>>({})

export interface McpWarning {
	/** The server key, so the same server does not stack up warnings across turns. */
	id: string
	message: string
}

/** Failures from the last turn; the panel shows them as a dismissible banner. */
export const mcpWarningsStore = new Store<McpWarning[]>([])

export function dismissMcpWarning(id: string): void {
	mcpWarningsStore.set((current) => current.filter((entry) => entry.id !== id))
}

/** What the model may call during a turn. Structural match for `ToolContext`. */
export interface McpToolContext {
	requestApproval(toolCallId: string, toolName: string, input: unknown, signal?: AbortSignal): Promise<boolean>
}

export interface McpToolInfo {
	/** Friendly name for the call card. */
	label: string
	/** Server label, shown as a badge on the call card. */
	server: string
}

export interface McpToolBundle {
	tools: ToolSet
	/** Keyed the same way as the tool set: model-facing tool name. */
	info: Map<string, McpToolInfo>
	warnings: McpWarning[]
	close: () => Promise<void>
}

export function enabledMcpServers(servers: McpServerSettings[]): McpServerSettings[] {
	return servers.filter((server) => server.enabled)
}

async function connect(server: McpServerSettings, signal?: AbortSignal): Promise<MCPClient> {
	return createMCPClient({
		clientName: 'local-browser-ai',
		transport: {
			type: 'http',
			url: server.url,
			headers: server.headers,
			// A browser rejects `fetch` called with any receiver but the global scope
			// ("Illegal invocation"), so hand the transport a wrapper that owns it.
			fetch: (input, init) => globalThis.fetch(input, init),
		},
		initializationOptions: { signal },
	})
}

async function listAllTools(client: MCPClient): Promise<McpDiscoveredTool[]> {
	const tools: McpDiscoveredTool[] = []
	let cursor: string | undefined

	for (let page = 0; page < MAX_TOOL_PAGES; page += 1) {
		const result = await client.listTools(cursor ? { params: { cursor } } : undefined)
		for (const entry of result.tools) {
			tools.push({
				name: entry.name,
				title: entry.title,
				description: entry.description,
				inputSchema: entry.inputSchema,
				readOnly: entry.annotations?.readOnlyHint === true,
			})
		}
		cursor = result.nextCursor
		if (!cursor) break
	}

	return tools
}

const inFlight = new Map<string, Promise<McpCatalogEntry>>()

function setCatalogEntry(key: string, entry: McpCatalogEntry): void {
	mcpCatalogStore.set((current) => ({ ...current, [key]: entry }))
}

/**
 * A 403 from an MCP server is usually origin validation, not a bad token: the server
 * only accepts clients whose `Origin` it knows, and a browser always sends one.
 */
export function describeServerError(server: McpServerSettings, error: unknown): string {
	const message = describeMcpError(error)
	if (mcpErrorStatus(error) !== 403 || server.stripOrigin) return message
	return `${message} Servers often reject browser requests by their Origin header; turn on “Send requests without an Origin header”.`
}

/**
 * Connect, list tools, disconnect. Used by the Settings page and the composer menu, so
 * the two show the same answer for the same server.
 */
export function refreshMcpServer(server: McpServerSettings): Promise<McpCatalogEntry> {
	const key = mcpServerKey(server)
	const pending = inFlight.get(key)
	if (pending) return pending

	setCatalogEntry(key, { ...(mcpCatalogStore.get()[key] ?? { status: 'idle', tools: [] }), status: 'loading' })

	const promise = (async (): Promise<McpCatalogEntry> => {
		let client: MCPClient | null = null
		try {
			client = await connect(server, AbortSignal.timeout(CONNECT_TIMEOUT_MS))
			const tools = await listAllTools(client)
			return { status: 'ready', tools, checkedAt: Date.now() }
		} catch (error) {
			return {
				status: 'error',
				tools: [],
				error: describeServerError(server, error),
				checkedAt: Date.now(),
			}
		} finally {
			await client?.close().catch(() => {})
		}
	})()

	const tracked = promise
		.then((entry) => {
			setCatalogEntry(key, entry)
			return entry
		})
		.finally(() => inFlight.delete(key))

	inFlight.set(key, tracked)
	return tracked
}

/** Refresh several servers at once without letting one failure reject the batch. */
export async function refreshMcpServers(servers: McpServerSettings[]): Promise<void> {
	await Promise.allSettled(servers.map((server) => refreshMcpServer(server)))
}

export function mcpCatalogEntry(server: McpServerSettings): McpCatalogEntry {
	return mcpCatalogStore.get()[mcpServerKey(server)] ?? { status: 'idle', tools: [] }
}

interface ConnectedServer {
	server: McpServerSettings
	client: MCPClient
	tools: McpDiscoveredTool[]
}

/**
 * Build the MCP half of a turn's tool set.
 *
 * Failures are reported, never thrown: a server that is down must not stop the chat.
 * Every call asks for approval unless the server is marked trusted.
 */
export async function buildMcpTools(
	context: McpToolContext,
	servers: McpServerSettings[],
	signal: AbortSignal,
): Promise<McpToolBundle> {
	const selected = enabledMcpServers(servers)
	const connected: ConnectedServer[] = []
	const warnings: McpWarning[] = []

	if (selected.length === 0) {
		return { tools: {}, info: new Map(), warnings, close: async () => {} }
	}

	const results = await Promise.allSettled(
		selected.map(async (server): Promise<ConnectedServer> => {
			const client = await connect(server, signal)
			try {
				return { server, client, tools: await listAllTools(client) }
			} catch (error) {
				await client.close().catch(() => {})
				throw error
			}
		}),
	)

	results.forEach((result, index) => {
		const server = selected[index]
		if (!server) return
		if (result.status === 'fulfilled') {
			connected.push(result.value)
			return
		}
		warnings.push({
			id: mcpServerKey(server),
			message: `${server.label}: ${describeServerError(server, result.reason)}`,
		})
	})

	const identities = connected.flatMap((entry) =>
		entry.tools.map((discovered) => ({
			serverId: entry.server.id,
			serverLabel: entry.server.label,
			toolName: discovered.name,
		})),
	)
	const names = assignToolNames(identities)

	const tools: ToolSet = {}
	const info = new Map<string, McpToolInfo>()

	for (const entry of connected) {
		for (const discovered of entry.tools) {
			const modelName = names.get(toolKey(entry.server.id, discovered.name))
			if (!modelName) continue
			if (!isMcpToolEnabled(entry.server, discovered.name)) continue

			const label = discovered.title || discovered.description || discovered.name
			info.set(modelName, { label, server: entry.server.label })
			tools[modelName] = makeTool(context, entry, discovered, modelName, signal)
		}
	}

	let closed = false
	const close = async () => {
		if (closed) return
		closed = true
		await Promise.allSettled(connected.map((entry) => entry.client.close()))
	}

	return { tools, info, warnings, close }
}

function makeTool(
	context: McpToolContext,
	entry: ConnectedServer,
	discovered: McpDiscoveredTool,
	modelName: string,
	signal: AbortSignal,
) {
	const description = [
		`[MCP: ${entry.server.label}]`,
		discovered.description || discovered.title || discovered.name,
	].join(' ')

	return tool({
		description,
		inputSchema: jsonSchema(normalizeToolSchema(discovered.inputSchema) as JSONSchema7),
		execute: async (input, options) => {
			const toolCallId = options.toolCallId
			if (signal.aborted) return { ok: false, error: 'The run was stopped.' }

			if (!isMcpToolAutoApproved(entry.server, discovered.name)) {
				const approved = await context.requestApproval(toolCallId, modelName, input, options.abortSignal)
				if (!approved) return { ok: false, error: 'The user declined to run this MCP tool.' }
			}

			try {
				const result = await entry.client.callTool({
					name: discovered.name,
					arguments: (input ?? {}) as Record<string, unknown>,
					options: { signal: options.abortSignal },
				})
				const formatted = formatMcpResult(result)
				if (formatted.isError) return { ok: false, error: formatted.text }
				return { ok: true, text: formatted.text, truncated: formatted.truncated }
			} catch (error) {
				return { ok: false, error: describeMcpError(error) }
			}
		},
	})
}
