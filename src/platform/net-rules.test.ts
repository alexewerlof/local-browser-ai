import { afterEach, describe, expect, it, vi } from 'vitest'
import type { McpServerSettings } from '../core/types'
import { originRulesFor, ruleFilterFor, syncOriginStripping } from './net-rules'

interface ChromeStub {
	runtime: { id: string }
	declarativeNetRequest?: {
		updateSessionRules: (options: { removeRuleIds?: number[]; addRules?: unknown[] }) => Promise<void>
	}
}

function stubChrome(api?: ChromeStub['declarativeNetRequest']): ChromeStub {
	const stub: ChromeStub = { runtime: { id: 'test-extension' } }
	if (api) stub.declarativeNetRequest = api
	;(globalThis as { chrome?: unknown }).chrome = stub
	return stub
}

afterEach(() => {
	delete (globalThis as { chrome?: unknown }).chrome
})

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

describe('ruleFilterFor', () => {
	it('anchors the endpoint origin and keeps the port', () => {
		expect(ruleFilterFor('http://127.0.0.1:9000/mcp')).toBe('|http://127.0.0.1:9000/')
		expect(ruleFilterFor('https://mcp.example.com/mcp')).toBe('|https://mcp.example.com/')
	})

	it('rejects unsupported schemes', () => {
		expect(ruleFilterFor('file:///tmp/socket')).toBeNull()
		expect(ruleFilterFor('not a url')).toBeNull()
	})
})

describe('originRulesFor', () => {
	it('builds one remove-Origin rule per opted-in server', () => {
		const rules = originRulesFor([
			server({ stripOrigin: true }),
			server({ id: 'mcp_2', stripOrigin: false }),
			server({ id: 'mcp_3', stripOrigin: true, url: 'http://127.0.0.1:9001/mcp' }),
		])

		expect(rules).toHaveLength(2)
		expect(rules[0]?.action.requestHeaders).toEqual([{ header: 'origin', operation: 'remove' }])
		expect(rules.map((rule) => rule.condition.urlFilter)).toEqual([
			'|http://127.0.0.1:9000/',
			'|http://127.0.0.1:9001/',
		])
		// Only XHR/fetch is touched, and the ids are stable and unique.
		expect(rules.every((rule) => rule.condition.resourceTypes.includes('xmlhttprequest'))).toBe(true)
		expect(new Set(rules.map((rule) => rule.id)).size).toBe(2)
		expect(originRulesFor([server({ stripOrigin: true })])[0]?.id).toBe(rules[0]?.id)
	})

	it('skips servers that opt out or have an unusable URL', () => {
		expect(originRulesFor([server()])).toEqual([])
		expect(originRulesFor([server({ stripOrigin: true, url: 'ftp://example.com/mcp' })])).toEqual([])
	})
})

describe('syncOriginStripping', () => {
	it('replaces the previous rules instead of accumulating them', async () => {
		const updateSessionRules = vi.fn(async (_options: { removeRuleIds?: number[]; addRules?: unknown[] }) => {})
		stubChrome({ updateSessionRules })

		await syncOriginStripping([server({ stripOrigin: true })])
		const first = updateSessionRules.mock.calls[0]?.[0]
		expect(first?.removeRuleIds).toEqual([])
		expect(first?.addRules).toHaveLength(1)

		await syncOriginStripping([])
		const second = updateSessionRules.mock.calls[1]?.[0]
		const firstIds = (first?.addRules ?? []).map((rule) => (rule as { id: number }).id)
		expect(second).toEqual({ removeRuleIds: firstIds, addRules: [] })
	})

	it('reports that it could not apply rules outside an extension', async () => {
		delete (globalThis as { chrome?: unknown }).chrome
		await expect(syncOriginStripping([server({ stripOrigin: true })])).resolves.toBe(false)
	})

	it('reports that it could not apply rules when the permission is missing', async () => {
		stubChrome()
		await expect(syncOriginStripping([server({ stripOrigin: true })])).resolves.toBe(false)
	})

	it('keeps the previous rules when the browser rejects the update', async () => {
		const updateSessionRules = vi.fn(async () => {
			throw new Error('rule limit')
		})
		stubChrome({ updateSessionRules })
		await expect(syncOriginStripping([server({ stripOrigin: true })])).resolves.toBe(false)
	})
})
