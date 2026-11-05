import { describe, expect, it } from 'vitest'
import {
	assignToolNames,
	describeMcpError,
	formatMcpResult,
	headersToRows,
	isHttpUrl,
	mcpServerKey,
	mcpToolName,
	normalizeToolSchema,
	rowsToHeaders,
	toolKey,
} from './mcp'
import { MAX_TOOL_CHARS } from './tool-text'

describe('isHttpUrl', () => {
	it('accepts http and https endpoints', () => {
		expect(isHttpUrl('http://127.0.0.1:9000/mcp')).toBe(true)
		expect(isHttpUrl('https://mcp.example.com/mcp')).toBe(true)
		expect(isHttpUrl('  https://mcp.example.com/mcp  ')).toBe(true)
	})

	it('rejects other schemes and garbage', () => {
		expect(isHttpUrl('file:///tmp/tools.sock')).toBe(false)
		expect(isHttpUrl('ws://localhost:9000/mcp')).toBe(false)
		expect(isHttpUrl('localhost:9000/mcp')).toBe(false)
		expect(isHttpUrl('')).toBe(false)
		expect(isHttpUrl('not a url')).toBe(false)
	})
})

describe('mcpServerKey', () => {
	it('changes when the endpoint or headers change, independent of header order', () => {
		const base = { id: 'a', url: 'http://localhost/mcp', headers: { A: '1', B: '2' } }
		const reordered = { id: 'a', url: 'http://localhost/mcp', headers: { B: '2', A: '1' } }
		expect(mcpServerKey(base)).toBe(mcpServerKey(reordered))
		expect(mcpServerKey(base)).not.toBe(mcpServerKey({ ...base, url: 'http://localhost/other' }))
		expect(mcpServerKey(base)).not.toBe(mcpServerKey({ ...base, headers: { A: '2', B: '2' } }))
	})

	it('tolerates a missing header map', () => {
		expect(mcpServerKey({ id: 'a', url: 'http://localhost/mcp' })).toContain('http://localhost/mcp')
	})
})

describe('tool names', () => {
	it('namespaces a tool under its server and stays provider-safe', () => {
		const name = mcpToolName('Local Tools', 'read-file')
		expect(name).toBe('mcp_local_tools_read-file')
		expect(name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/)
	})

	it('normalises characters providers reject', () => {
		const name = mcpToolName('My Server!', 'weather.get forecast')
		expect(name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/)
		expect(name).toContain('my_server')
	})

	it('truncates long names without exceeding the limit', () => {
		const name = mcpToolName('s'.repeat(200), 't'.repeat(300))
		expect(name.length).toBeLessThanOrEqual(64)
		expect(name).toMatch(/^[a-zA-Z0-9_-]+$/)
	})

	it('disambiguates collisions deterministically', () => {
		const identities = [
			{ serverId: 'a', serverLabel: 'Same', toolName: 'tool' },
			{ serverId: 'b', serverLabel: 'Same', toolName: 'tool' },
			{ serverId: 'a', serverLabel: 'Same', toolName: 'other.tool' },
		]
		const first = assignToolNames(identities)
		const second = assignToolNames(identities)
		expect([...first.values()]).toEqual([...second.values()])
		expect(new Set(first.values()).size).toBe(3)
		expect(first.get(toolKey('a', 'tool'))).toBe('mcp_same_tool')
		expect(first.get(toolKey('b', 'tool'))).not.toBe('mcp_same_tool')
		for (const name of first.values()) expect(name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/)
	})
})

describe('normalizeToolSchema', () => {
	it('fills in an object schema when the server sends none', () => {
		expect(normalizeToolSchema(undefined)).toEqual({ type: 'object', properties: {} })
		expect(normalizeToolSchema('nope')).toEqual({ type: 'object', properties: {} })
	})

	it('keeps a server schema intact', () => {
		const schema = {
			type: 'object',
			properties: { query: { type: 'string' } },
			required: ['query'],
		}
		expect(normalizeToolSchema(schema)).toEqual(schema)
	})

	it('adds the missing type to a properties-only schema', () => {
		expect(normalizeToolSchema({ properties: { q: { type: 'string' } } })).toEqual({
			type: 'object',
			properties: { q: { type: 'string' } },
		})
	})
})

describe('formatMcpResult', () => {
	it('joins text blocks', () => {
		const result = formatMcpResult({
			content: [
				{ type: 'text', text: 'one' },
				{ type: 'text', text: 'two' },
			],
		})
		expect(result).toEqual({ text: 'one\n\ntwo', truncated: false, isError: false })
	})

	it('marks server errors but still returns the text', () => {
		const result = formatMcpResult({ content: [{ type: 'text', text: 'bad input' }], isError: true })
		expect(result.isError).toBe(true)
		expect(result.text).toBe('bad input')
	})

	it('never inlines base64 image data', () => {
		const result = formatMcpResult({
			content: [{ type: 'image', mimeType: 'image/png', data: 'AAAA'.repeat(1000) }],
		})
		expect(result.text).toBe('[image: image/png]')
		expect(result.text).not.toContain('AAAA')
	})

	it('describes binary resources and reads text resources', () => {
		expect(
			formatMcpResult({
				content: [
					{ type: 'resource', resource: { uri: 'file:///a.txt', text: 'hello' } },
					{ type: 'resource', resource: { uri: 'file:///b.png', mimeType: 'image/png', blob: 'xxx' } },
				],
			}).text,
		).toBe('hello\n\n[binary resource: file:///b.png, image/png]')
	})

	it('falls back to structured content', () => {
		const result = formatMcpResult({ content: [], structuredContent: { total: 3 } })
		expect(result.text).toBe('{\n  "total": 3\n}')
	})

	it('reports an empty result and clips long output', () => {
		expect(formatMcpResult({ content: [] }).text).toBe('(The tool returned no output.)')
		const long = formatMcpResult({ content: [{ type: 'text', text: 'x'.repeat(MAX_TOOL_CHARS + 50) }] })
		expect(long.truncated).toBe(true)
		expect(long.text).toContain('… (truncated)')
	})
})

describe('header rows', () => {
	it('round-trips Name/value pairs in order', () => {
		const rows = headersToRows({ Authorization: 'Bearer abc', 'X-Env': 'test' })
		expect(rows).toEqual([
			{ name: 'Authorization', value: 'Bearer abc' },
			{ name: 'X-Env', value: 'test' },
		])
		expect(rowsToHeaders(rows)).toEqual({
			headers: { Authorization: 'Bearer abc', 'X-Env': 'test' },
			errors: [undefined, undefined],
		})
	})

	it('tolerates a missing header map', () => {
		expect(headersToRows(undefined)).toEqual([])
		expect(rowsToHeaders([])).toEqual({ headers: {}, errors: [] })
	})

	it('keeps colons inside the value', () => {
		const { headers } = rowsToHeaders([{ name: 'X-Url', value: 'http://localhost:9000/mcp' }])
		expect(headers['X-Url']).toBe('http://localhost:9000/mcp')
	})

	it('drops a fully blank row without reporting it', () => {
		const result = rowsToHeaders([
			{ name: '  ', value: '' },
			{ name: 'X-Key', value: '1' },
		])
		expect(result.headers).toEqual({ 'X-Key': '1' })
		expect(result.errors).toEqual([undefined, undefined])
	})

	it('reports the row that is incomplete or invalid', () => {
		const result = rowsToHeaders([
			{ name: '', value: 'orphan' },
			{ name: 'Bad Name', value: 'x' },
			{ name: 'NoValue', value: '' },
			{ name: 'Good', value: 'yes' },
		])
		expect(result.headers).toEqual({ Good: 'yes' })
		expect(result.errors[0]).toMatch(/name/)
		expect(result.errors[1]).toMatch(/not a valid header name/)
		expect(result.errors[2]).toMatch(/value/)
		expect(result.errors[3]).toBeUndefined()
	})

	it('rejects duplicate names regardless of case', () => {
		const result = rowsToHeaders([
			{ name: 'X-Key', value: '1' },
			{ name: 'x-key', value: '2' },
		])
		expect(result.headers).toEqual({ 'X-Key': '1' })
		expect(result.errors[1]).toMatch(/already used by row 1/)
	})
})

describe('describeMcpError', () => {
	it('explains HTTP status codes', () => {
		expect(describeMcpError({ statusCode: 401 })).toMatch(/credentials/)
		expect(describeMcpError({ status: 404 })).toMatch(/not found/)
		expect(describeMcpError({ statusCode: 503 })).toMatch(/HTTP 503/)
	})

	it('explains unreachable servers and aborts', () => {
		expect(describeMcpError(new TypeError('Failed to fetch'))).toMatch(/Could not reach/)
		const aborted = new Error('aborted')
		aborted.name = 'AbortError'
		expect(describeMcpError(aborted)).toBe('The request was cancelled.')
	})

	it('falls back to the message and never returns an empty string', () => {
		expect(describeMcpError(new Error('boom'))).toBe('boom')
		expect(describeMcpError(undefined)).toBe('The MCP server failed.')
	})
})
