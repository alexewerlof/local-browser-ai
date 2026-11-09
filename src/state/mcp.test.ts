import { describe, expect, it, vi } from 'vitest'
import { buildMcpTools, mcpCatalogEntry, refreshMcpServer, type McpToolContext } from './mcp'
import type { McpServerSettings } from '../core/types'
import { mcpServerKey } from '../core/mcp'

const { createMCPClientMock } = vi.hoisted(() => ({ createMCPClientMock: vi.fn() }))

vi.mock('@ai-sdk/mcp', () => ({ createMCPClient: createMCPClientMock }))

const server = (overrides: Partial<McpServerSettings> = {}): McpServerSettings => ({
	id: 'mcp_1',
	label: 'Local tools',
	url: 'http://127.0.0.1:9000/mcp',
	headers: {},
	enabled: true,
	autoApprove: false,
	autoApproveTools: [],
	disabledTools: [],
	stripOrigin: false,
	...overrides,
})

const toolDef = (name: string, description = `${name} tool`) => ({
	name,
	description,
	inputSchema: { type: 'object', properties: { value: { type: 'string' } } },
})

function fakeClient(options: { tools?: unknown[]; callTool?: (args: unknown) => unknown; pages?: unknown[][] } = {}) {
	const callTool = vi.fn(options.callTool ?? (async () => ({ content: [{ type: 'text', text: 'ok' }] })))
	const close = vi.fn(async () => {})
	const pages = options.pages ?? [options.tools ?? [toolDef('echo')]]
	let page = 0

	const listTools = vi.fn(async (request?: { params?: { cursor?: string } }) => {
		const index = request?.params?.cursor ? Number(request.params.cursor) : page
		page = index + 1
		const tools = pages[index] ?? []
		const next = page < pages.length ? String(page) : undefined
		return next ? { tools, nextCursor: next } : { tools }
	})

	return { listTools, callTool, close }
}

function context(approved = true): McpToolContext & { requestApproval: ReturnType<typeof vi.fn> } {
	return { requestApproval: vi.fn(async () => approved) }
}

const runSignal = new AbortController().signal
const runOptions = { toolCallId: 'call_1', messages: [], abortSignal: runSignal } as never

describe('buildMcpTools', () => {
	it('advertises namespaced tools only for enabled servers', async () => {
		const client = fakeClient({ tools: [toolDef('echo'), toolDef('add')] })
		createMCPClientMock.mockResolvedValue(client)

		const bundle = await buildMcpTools(context(), [server(), server({ id: 'off', enabled: false })], runSignal)

		expect(Object.keys(bundle.tools)).toEqual(['mcp_local_tools_echo', 'mcp_local_tools_add'])
		expect(bundle.warnings).toEqual([])
		expect(createMCPClientMock).toHaveBeenCalledTimes(1)
		expect(createMCPClientMock.mock.calls[0]?.[0]).toMatchObject({
			transport: { type: 'http', url: 'http://127.0.0.1:9000/mcp', headers: {} },
		})
		await bundle.close()
		expect(client.close).toHaveBeenCalled()
	})

	it('closes every client exactly once', async () => {
		const client = fakeClient()
		createMCPClientMock.mockResolvedValue(client)
		const bundle = await buildMcpTools(context(), [server()], runSignal)
		await bundle.close()
		await bundle.close()
		expect(client.close).toHaveBeenCalledTimes(1)
	})

	it('honours per-tool switches inside an enabled server', async () => {
		createMCPClientMock.mockResolvedValue(fakeClient({ tools: [toolDef('echo'), toolDef('add')] }))

		const bundle = await buildMcpTools(context(), [server({ disabledTools: ['echo'] })], runSignal)

		expect(Object.keys(bundle.tools)).toEqual(['mcp_local_tools_add'])
	})

	it('pages through tools/list', async () => {
		createMCPClientMock.mockResolvedValue(fakeClient({ pages: [[toolDef('one')], [toolDef('two')]] }))

		const bundle = await buildMcpTools(context(), [server()], runSignal)
		expect(Object.keys(bundle.tools)).toEqual(['mcp_local_tools_one', 'mcp_local_tools_two'])
	})

	it('records the friendly label and server for the call card', async () => {
		createMCPClientMock.mockResolvedValue(fakeClient({ tools: [toolDef('echo', 'Echo a value back')] }))
		const bundle = await buildMcpTools(context(), [server()], runSignal)
		expect(bundle.info.get('mcp_local_tools_echo')).toEqual({
			label: 'Echo a value back',
			server: 'Local tools',
		})
	})

	it('asks for approval and never calls the server when denied', async () => {
		const client = fakeClient()
		createMCPClientMock.mockResolvedValue(client)
		const ctx = context(false)
		const bundle = await buildMcpTools(ctx, [server()], runSignal)

		const execute = bundle.tools['mcp_local_tools_echo']?.execute as unknown as (
			input: unknown,
			options: unknown,
		) => Promise<unknown>
		const result = await execute({ value: 'hi' }, runOptions)

		expect(ctx.requestApproval).toHaveBeenCalledWith('call_1', 'mcp_local_tools_echo', { value: 'hi' }, runSignal)
		expect(client.callTool).not.toHaveBeenCalled()
		expect(result).toEqual({ ok: false, error: 'The user declined to run this MCP tool.' })
	})

	it('runs a trusted server without prompting and returns the text', async () => {
		const client = fakeClient({
			callTool: async () => ({ content: [{ type: 'text', text: 'hello from mcp' }] }),
		})
		createMCPClientMock.mockResolvedValue(client)
		const ctx = context(true)
		const bundle = await buildMcpTools(ctx, [server({ autoApprove: true })], runSignal)
		const execute = bundle.tools['mcp_local_tools_echo']?.execute as unknown as (
			input: unknown,
			options: unknown,
		) => Promise<unknown>
		const result = await execute({ value: 'hi' }, runOptions)

		expect(ctx.requestApproval).not.toHaveBeenCalled()
		expect(client.callTool).toHaveBeenCalledWith({
			name: 'echo',
			arguments: { value: 'hi' },
			options: { signal: runSignal },
		})
		expect(result).toEqual({ ok: true, text: 'hello from mcp', truncated: false })
	})

	it('skips the prompt for a tool the user approved on its own', async () => {
		const client = fakeClient()
		createMCPClientMock.mockResolvedValue(client)
		const ctx = context(false)
		const bundle = await buildMcpTools(ctx, [server({ autoApproveTools: ['echo'] })], runSignal)

		const execute = bundle.tools['mcp_local_tools_echo']?.execute as unknown as (
			input: unknown,
			options: unknown,
		) => Promise<unknown>
		await execute({ value: 'hi' }, runOptions)

		expect(ctx.requestApproval).not.toHaveBeenCalled()
		expect(client.callTool).toHaveBeenCalled()
	})

	it('still asks for a tool the user did not approve', async () => {
		const client = fakeClient()
		createMCPClientMock.mockResolvedValue(client)
		const ctx = context(false)
		const bundle = await buildMcpTools(ctx, [server({ autoApproveTools: ['add'] })], runSignal)

		const execute = bundle.tools['mcp_local_tools_echo']?.execute as unknown as (
			input: unknown,
			options: unknown,
		) => Promise<unknown>
		const result = await execute({ value: 'hi' }, runOptions)

		expect(ctx.requestApproval).toHaveBeenCalled()
		expect(client.callTool).not.toHaveBeenCalled()
		expect(result).toEqual({ ok: false, error: 'The user declined to run this MCP tool.' })
	})

	it('reports a server error result as a failed tool call', async () => {
		createMCPClientMock.mockResolvedValue(
			fakeClient({ callTool: async () => ({ isError: true, content: [{ type: 'text', text: 'bad input' }] }) }),
		)
		const bundle = await buildMcpTools(context(), [server({ autoApprove: true })], runSignal)
		const execute = bundle.tools['mcp_local_tools_echo']?.execute as unknown as (
			input: unknown,
			options: unknown,
		) => Promise<unknown>

		expect(await execute({}, runOptions)).toEqual({ ok: false, error: 'bad input' })
	})

	it('keeps the reachable servers and warns about the others', async () => {
		createMCPClientMock.mockImplementation(async (config: { transport: { url: string } }) => {
			if (config.transport.url.includes('broken')) throw new TypeError('Failed to fetch')
			return fakeClient()
		})
		const healthy = server({ id: 'good', label: 'Good' })
		const broken = server({ id: 'bad', label: 'Broken', url: 'http://broken.test/mcp' })

		const bundle = await buildMcpTools(context(), [healthy, broken], runSignal)

		expect(Object.keys(bundle.tools)).toEqual(['mcp_good_echo'])
		expect(bundle.warnings).toHaveLength(1)
		expect(bundle.warnings[0]?.message).toMatch(/^Broken: Could not reach the MCP server/)
	})

	it('does nothing when no server is enabled', async () => {
		const bundle = await buildMcpTools(context(), [server({ enabled: false })], runSignal)
		expect(createMCPClientMock).not.toHaveBeenCalled()
		expect(bundle.tools).toEqual({})
		expect(bundle.warnings).toEqual([])
	})

	it('refuses to call a server once the run is aborted', async () => {
		const client = fakeClient()
		createMCPClientMock.mockResolvedValue(client)
		const controller = new AbortController()
		const bundle = await buildMcpTools(context(), [server({ autoApprove: true })], controller.signal)
		controller.abort()

		const execute = bundle.tools['mcp_local_tools_echo']?.execute as unknown as (
			input: unknown,
			options: unknown,
		) => Promise<unknown>
		const result = await execute({}, { ...(runOptions as object), abortSignal: controller.signal })

		expect(client.callTool).not.toHaveBeenCalled()
		expect(result).toEqual({ ok: false, error: 'The run was stopped.' })
	})
})

describe('refreshMcpServer', () => {
	it('caches discovered tools under the server key', async () => {
		createMCPClientMock.mockResolvedValue(fakeClient({ tools: [toolDef('echo')] }))
		const entry = await refreshMcpServer(server())

		expect(entry.status).toBe('ready')
		expect(entry.tools.map((tool) => tool.name)).toEqual(['echo'])
		expect(mcpCatalogEntry(server()).status).toBe('ready')
	})

	it('stores a readable error and still closes the client', async () => {
		createMCPClientMock.mockRejectedValue(new TypeError('Failed to fetch'))
		const entry = await refreshMcpServer(server({ url: 'http://down.test/mcp' }))

		expect(entry.status).toBe('error')
		expect(entry.error).toMatch(/Could not reach/)
		expect(mcpCatalogEntry(server({ url: 'http://down.test/mcp' })).status).toBe('error')
	})

	it('deduplicates concurrent refreshes of the same server', async () => {
		createMCPClientMock.mockClear()
		createMCPClientMock.mockResolvedValue(fakeClient({ tools: [toolDef('one')] }))
		const target = server({ id: 'dedupe', url: 'http://dedupe.test/mcp' })

		const [first, second] = await Promise.all([refreshMcpServer(target), refreshMcpServer(target)])

		expect(first).toEqual(second)
		expect(createMCPClientMock).toHaveBeenCalledTimes(1)
	})

	it('uses the endpoint in the cache key, so an edit invalidates the entry', async () => {
		expect(mcpServerKey(server())).not.toBe(mcpServerKey(server({ url: 'http://other.test/mcp' })))
	})
})
