import { describe, expect, it } from 'vitest'
import { defaultSettings, hasEnabledTools, normalizeSettings } from './settings'

const mcpServer = (overrides: Record<string, unknown> = {}) => ({
	id: 'mcp_1',
	label: 'Local tools',
	url: 'http://127.0.0.1:9000/mcp',
	headers: {},
	enabled: true,
	autoApprove: false,
	disabledTools: [],
	stripOrigin: false,
	...overrides,
})

describe('normalizeSettings', () => {
	it('falls back to defaults for garbage input', () => {
		const settings = normalizeSettings('nope')
		expect(settings.version).toBe(4)
		expect(settings.providers[0]?.kind).toBe('prompt-api')
		expect(settings.providers[0]?.models).toEqual(['text'])
	})

	it('adds the system prompt when an older store did not have one', () => {
		const stored: Record<string, unknown> = { ...defaultSettings() }
		delete stored.systemPrompt
		const settings = normalizeSettings(stored)
		expect(settings.systemPrompt.length).toBeGreaterThan(20)
	})

	it('always restores the built-in provider', () => {
		const stored = {
			...defaultSettings(),
			providers: [
				{
					id: 'local',
					kind: 'openai-compatible',
					label: 'Local',
					baseURL: 'http://localhost:8080/v1',
					models: ['llama'],
				},
			],
			defaultModel: { providerId: 'local', modelId: 'llama' },
		}
		const settings = normalizeSettings(stored)
		expect(settings.providers.map((provider) => provider.id)).toEqual(['prompt-api', 'local'])
		expect(settings.defaultModel).toEqual({ providerId: 'local', modelId: 'llama' })
	})

	it('re-adds built-in skills that were removed or edited away', () => {
		const stored = { ...defaultSettings(), skills: [] }
		const settings = normalizeSettings(stored)
		expect(settings.skills.map((skill) => skill.id)).toContain('summarize-page')
	})

	it('drops unknown tool ids', () => {
		const stored = {
			...defaultSettings(),
			tools: { enabled: ['find_in_page', 'does_not_exist'], autoApprove: ['nope'] },
		}
		const settings = normalizeSettings(stored)
		expect(settings.tools.enabled).toEqual(['find_in_page'])
		expect(settings.tools.autoApprove).toEqual([])
	})

	it('enables every tool introduced after the stored settings version', () => {
		const stored = {
			...defaultSettings(),
			version: 1,
			tools: { enabled: ['find_in_page'], autoApprove: [] },
		}
		const settings = normalizeSettings(stored)
		expect(settings.version).toBe(4)
		expect(settings.tools.enabled).toEqual(['find_in_page', 'get_current_datetime', 'search_web'])
		expect(settings.tools.autoApprove).toEqual(['get_current_datetime', 'search_web'])
	})

	it('adds only the tools newer than the stored version', () => {
		const stored = {
			...defaultSettings(),
			version: 2,
			tools: { enabled: ['find_in_page', 'get_current_datetime'], autoApprove: ['get_current_datetime'] },
		}
		const settings = normalizeSettings(stored)
		expect(settings.version).toBe(4)
		expect(settings.tools.enabled).toEqual(['find_in_page', 'get_current_datetime', 'search_web'])
		expect(settings.tools.autoApprove).toEqual(['get_current_datetime', 'search_web'])
	})

	it('respects disabling a migrated tool once the store is current', () => {
		const stored = {
			...defaultSettings(),
			tools: { enabled: ['find_in_page'], autoApprove: [] },
		}
		const settings = normalizeSettings(stored)
		expect(settings.tools.enabled).toEqual(['find_in_page'])
	})

	it('resets the default model when its provider is gone', () => {
		const stored = {
			...defaultSettings(),
			defaultModel: { providerId: 'ghost', modelId: 'x' },
		}
		const settings = normalizeSettings(stored)
		expect(settings.defaultModel).toEqual({ providerId: 'prompt-api', modelId: 'text' })
	})

	it('clamps nothing silently: it rejects out-of-range numbers', () => {
		const stored = {
			...defaultSettings(),
			context: { ...defaultSettings().context, compactionThreshold: 0.2 },
		}
		// Out of range means the whole object is rejected, which keeps invalid values out.
		expect(normalizeSettings(stored).context.compactionThreshold).toBe(0.75)
	})

	it('adds an empty MCP list to a store written before MCP existed', () => {
		const stored = {
			...defaultSettings(),
			version: 3,
			tools: { enabled: ['find_in_page'], autoApprove: [] },
		}
		const settings = normalizeSettings(stored)
		expect(settings.version).toBe(4)
		expect(settings.tools.mcp).toEqual([])
	})

	it('keeps MCP servers across normalization, including a disabled one', () => {
		const stored = {
			...defaultSettings(),
			tools: { enabled: [], autoApprove: [], mcp: [mcpServer(), mcpServer({ id: 'mcp_2', enabled: false })] },
		}
		const settings = normalizeSettings(stored)
		expect(settings.tools.mcp.map((server) => server.id)).toEqual(['mcp_1', 'mcp_2'])
		expect(settings.tools.mcp[1]?.enabled).toBe(false)
		expect(settings.tools.mcp[0]?.headers).toEqual({})
	})

	it('defaults the Origin opt-in to off for a server stored before it existed', () => {
		const { stripOrigin: _omitted, ...legacy } = mcpServer()
		const stored = {
			...defaultSettings(),
			tools: { enabled: [], autoApprove: [], mcp: [legacy] },
		}
		const settings = normalizeSettings(stored)
		expect(settings.tools.mcp[0]?.stripOrigin).toBe(false)
	})

	it('drops a malformed MCP server without resetting the rest of the document', () => {
		const stored = {
			...defaultSettings(),
			tools: {
				enabled: ['find_in_page'],
				autoApprove: [],
				mcp: [
					mcpServer(),
					{ id: 'broken', label: 'Broken', url: 'file:///tmp/tools.sock' },
					{ label: 'No id', url: 'http://localhost/mcp' },
				],
			},
		}
		const settings = normalizeSettings(stored)
		expect(settings.tools.mcp.map((server) => server.id)).toEqual(['mcp_1'])
		expect(settings.tools.enabled).toEqual(['find_in_page'])
		expect(settings.providers[0]?.kind).toBe('prompt-api')
	})

	it('drops duplicate MCP server ids', () => {
		const stored = {
			...defaultSettings(),
			tools: { enabled: [], autoApprove: [], mcp: [mcpServer(), mcpServer({ label: 'Duplicate' })] },
		}
		const settings = normalizeSettings(stored)
		expect(settings.tools.mcp).toHaveLength(1)
		expect(settings.tools.mcp[0]?.label).toBe('Local tools')
	})
})

describe('hasEnabledTools', () => {
	it('counts built-in tools and enabled MCP servers', () => {
		expect(hasEnabledTools(defaultSettings())).toBe(true)

		const withoutBuiltIns = {
			...defaultSettings(),
			tools: { enabled: [], autoApprove: [], mcp: [] },
		}
		expect(hasEnabledTools(withoutBuiltIns)).toBe(false)

		const mcpOnly = {
			...withoutBuiltIns,
			tools: { ...withoutBuiltIns.tools, mcp: [mcpServer()] },
		}
		expect(hasEnabledTools(mcpOnly)).toBe(true)

		const mcpDisabled = {
			...withoutBuiltIns,
			tools: { ...withoutBuiltIns.tools, mcp: [mcpServer({ enabled: false })] },
		}
		expect(hasEnabledTools(mcpDisabled)).toBe(false)
	})
})
