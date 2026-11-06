import { createServer } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

/**
 * A stateless Streamable HTTP MCP server for the browser harness.
 *
 * It is deliberately tiny and local: scenarios must never depend on a real MCP server
 * or on a fixed port. Every call is recorded so a scenario can assert that the model's
 * tool call actually reached the server.
 *
 * `requireHeaders` models the common real-world case of a server that answers 401
 * without credentials, which is what proves the settings' Name/Value rows are really
 * sent. It is checked on POST only: a browser's CORS preflight (OPTIONS) never carries
 * them, and the notification stream (GET) is not part of what the panel calls.
 */
export async function startMockMcpServer(options = {}) {
	const { calls = [], rejectOrigins = false, requireHeaders = null } = options
	const seenOrigins = []
	/** Required headers that were missing or wrong, once per rejected request. */
	const denied = []

	/** One server per request: stateless mode has no session to share. */
	const createMcp = () => {
		const mcp = new McpServer({ name: 'mock-mcp', version: '1.0.0' })

		mcp.registerTool(
			'echo',
			{
				title: 'Echo',
				description: 'Echo a message back.',
				inputSchema: { message: z.string() },
				annotations: { readOnlyHint: true },
			},
			async ({ message }) => {
				calls.push({ name: 'echo', arguments: { message } })
				return { content: [{ type: 'text', text: `echo: ${message}` }] }
			},
		)

		mcp.registerTool(
			'add',
			{
				title: 'Add',
				description: 'Add two numbers.',
				inputSchema: { a: z.number(), b: z.number() },
			},
			async ({ a, b }) => {
				calls.push({ name: 'add', arguments: { a, b } })
				return { content: [{ type: 'text', text: String(a + b) }] }
			},
		)

		return mcp
	}

	const readBody = (request) =>
		new Promise((resolve, reject) => {
			let raw = ''
			request.on('data', (chunk) => {
				raw += chunk
			})
			request.on('end', () => {
				try {
					resolve(raw ? JSON.parse(raw) : undefined)
				} catch (error) {
					reject(error)
				}
			})
			request.on('error', reject)
		})

	const httpServer = createServer(async (request, response) => {
		// The harness serves dist/ as an ordinary page, so the MCP server needs CORS. Echo
		// the requested header names rather than `*`: the wildcard explicitly does not
		// cover `Authorization`, so a preflight for it would otherwise fail.
		const requestedHeaders = request.headers['access-control-request-headers']
		response.setHeader('Access-Control-Allow-Origin', '*')
		response.setHeader('Access-Control-Allow-Headers', requestedHeaders ?? '*')
		response.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id')
		response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')

		if (request.method === 'OPTIONS') {
			response.writeHead(204)
			response.end()
			return
		}

		// Mirrors the DNS-rebinding protection many MCP servers apply: any browser
		// Origin is refused, which is what the extension's `stripOrigin` option solves.
		if (rejectOrigins && request.headers.origin) {
			seenOrigins.push(request.headers.origin)
			response.writeHead(403, { 'Content-Type': 'application/json' })
			response.end(JSON.stringify({ error: 'Origin not allowed' }))
			return
		}

		if (requireHeaders && request.method === 'POST') {
			const missing = Object.entries(requireHeaders).filter(
				([name, value]) => request.headers[name.toLowerCase()] !== value,
			)
			if (missing.length > 0) {
				denied.push(...missing.map(([name]) => name))
				response.writeHead(401, { 'Content-Type': 'application/json' })
				response.end(JSON.stringify({ error: 'Unauthorized' }))
				return
			}
		}

		if (!request.url?.startsWith('/mcp')) {
			response.writeHead(404, { 'Content-Type': 'application/json' })
			response.end(JSON.stringify({ error: 'Not found' }))
			return
		}

		// Streamable HTTP clients open a standalone stream for server notifications.
		// This mock never sends any, but answering keeps the client from logging a 405.
		if (request.method === 'GET') {
			response.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
			})
			response.write(': connected\n\n')
			request.on('close', () => response.end())
			return
		}

		// Stateless mode has no session to terminate, but accept the request.
		if (request.method === 'DELETE') {
			response.writeHead(204)
			response.end()
			return
		}

		if (request.method !== 'POST') {
			response.writeHead(405, { 'Content-Type': 'application/json' })
			response.end(JSON.stringify({ error: 'Use POST' }))
			return
		}

		const mcp = createMcp()
		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true,
		})
		response.on('close', () => {
			void transport.close()
			void mcp.close()
		})

		try {
			const body = await readBody(request)
			await mcp.connect(transport)
			await transport.handleRequest(request, response, body)
		} catch (error) {
			if (!response.headersSent) {
				response.writeHead(500, { 'Content-Type': 'application/json' })
				response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
			}
		}
	})

	await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
	const { port } = httpServer.address()

	return {
		url: `http://127.0.0.1:${port}/mcp`,
		calls,
		/** Origins refused by `rejectOrigins`, so a test can prove the header was sent. */
		seenOrigins,
		/** Required headers refused by `requireHeaders`; empty when every request had them. */
		denied,
		async close() {
			httpServer.closeAllConnections()
			await new Promise((resolve) => httpServer.close(resolve))
		},
	}
}
