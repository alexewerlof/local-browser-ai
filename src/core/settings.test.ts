import { describe, expect, it } from 'vitest'
import { SETTINGS_VERSION, defaultSettings, enabledBuiltInTools, hasEnabledTools, normalizeSettings } from './settings'

const mcpServer = (overrides: Record<string, unknown> = {}) => ({
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

describe('normalizeSettings', () => {
	it('falls back to defaults for garbage input', () => {
		const settings = normalizeSettings('nope')
		expect(settings.version).toBe(SETTINGS_VERSION)
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
					baseURL: 'http://localhost:9931/v1',
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
			tools: { enabled: ['get_selection', 'does_not_exist'], autoApprove: ['nope'] },
		}
		const settings = normalizeSettings(stored)
		expect(settings.tools.enabled).toEqual(['get_selection'])
		expect(settings.tools.autoApprove).toEqual([])
	})

	it('replaces the page tools merged in v10', () => {
		const stored = {
			...defaultSettings(),
			version: 9,
			tools: {
				enabled: ['read_attached_page', 'get_page_outline', 'read_page_section', 'find_in_page', 'open_url'],
				autoApprove: ['read_attached_page', 'get_page_outline', 'find_in_page', 'open_url'],
			},
		}
		const settings = normalizeSettings(stored)
		expect(settings.tools.enabled).toEqual(['read_page'])
		// Reading is still free; the URL form asks because it opens a tab.
		expect(settings.tools.autoApprove).toEqual(['read_page'])
	})

	it('enables every tool introduced after the stored settings version', () => {
		const stored = {
			...defaultSettings(),
			version: 1,
			tools: { enabled: ['get_selection'], autoApprove: [] },
		}
		const settings = normalizeSettings(stored)
		expect(settings.version).toBe(SETTINGS_VERSION)
		expect(settings.tools.enabled).toEqual([
			'get_selection',
			'get_current_datetime',
			'search_web',
			'remember',
			'recall',
			'read_page',
		])
		expect(settings.tools.autoApprove).toEqual(['get_current_datetime', 'search_web', 'recall', 'read_page'])
	})

	it('adds only the tools newer than the stored version', () => {
		const stored = {
			...defaultSettings(),
			version: 2,
			tools: { enabled: ['get_selection', 'get_current_datetime'], autoApprove: ['get_current_datetime'] },
		}
		const settings = normalizeSettings(stored)
		expect(settings.version).toBe(SETTINGS_VERSION)
		expect(settings.tools.enabled).toEqual([
			'get_selection',
			'get_current_datetime',
			'search_web',
			'remember',
			'recall',
			'read_page',
		])
		expect(settings.tools.autoApprove).toEqual(['get_current_datetime', 'search_web', 'recall', 'read_page'])
	})

	it('respects disabling a migrated tool once the store is current', () => {
		const stored = {
			...defaultSettings(),
			tools: { enabled: ['get_selection'], autoApprove: [] },
		}
		const settings = normalizeSettings(stored)
		expect(settings.tools.enabled).toEqual(['get_selection'])
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
			tools: { enabled: ['read_page'], autoApprove: [] },
		}
		const settings = normalizeSettings(stored)
		expect(settings.version).toBe(SETTINGS_VERSION)
		expect(settings.tools.mcp).toEqual([])
	})

	it('carries a stored submit key over from the old sendKey field', () => {
		const { submitKey: _renamed, ...legacyUi } = defaultSettings().ui
		const stored = {
			...defaultSettings(),
			version: 4,
			ui: { ...legacyUi, sendKey: 'mod+enter' },
		}
		const settings = normalizeSettings(stored)
		expect(settings.version).toBe(SETTINGS_VERSION)
		expect(settings.ui.submitKey).toBe('mod+enter')
	})

	it('fills in a missing submit key with the default', () => {
		const stored = { ...defaultSettings(), ui: { theme: 'dark' } }
		const settings = normalizeSettings(stored)
		expect(settings.ui).toEqual({ theme: 'dark', submitKey: 'enter', fontSize: 'medium' })
	})

	it('adds the rendering flags to a store written before they existed', () => {
		const stored = { ...defaultSettings(), version: 6 }
		const settings = normalizeSettings(stored)
		expect(settings.version).toBe(SETTINGS_VERSION)
		expect(settings.rendering).toEqual({ math: true, codeHighlighting: false })
	})

	it('keeps the rendering flags the user chose', () => {
		const stored = { ...defaultSettings(), rendering: { math: false, codeHighlighting: true } }
		expect(normalizeSettings(stored).rendering).toEqual({ math: false, codeHighlighting: true })
	})

	it('falls back per rendering flag when a value is malformed', () => {
		const stored = { ...defaultSettings(), rendering: { math: 'yes', codeHighlighting: true } }
		expect(normalizeSettings(stored).rendering).toEqual({ math: true, codeHighlighting: true })
	})

	it('defaults the font size to medium', () => {
		expect(defaultSettings().ui.fontSize).toBe('medium')
	})

	it('adds the font size to a store written before it existed, keeping the rest of the UI', () => {
		const stored = {
			...defaultSettings(),
			version: 7,
			ui: { theme: 'dark', submitKey: 'mod+enter' },
		}
		expect(normalizeSettings(stored).ui).toEqual({
			theme: 'dark',
			submitKey: 'mod+enter',
			fontSize: 'medium',
		})
	})

	it('keeps the font size the user chose', () => {
		const stored = { ...defaultSettings(), ui: { ...defaultSettings().ui, fontSize: 'large' } }
		expect(normalizeSettings(stored).ui.fontSize).toBe('large')
	})

	it('falls back to medium for an unknown font size without resetting the document', () => {
		const stored = {
			...defaultSettings(),
			ui: { ...defaultSettings().ui, fontSize: 'gigantic' },
		}
		const settings = normalizeSettings(stored)
		expect(settings.ui.fontSize).toBe('medium')
		expect(settings.providers[0]?.kind).toBe('prompt-api')
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

	it('defaults a server written before per-tool auto-approve to none approved', () => {
		const { autoApproveTools: _omitted, ...legacy } = mcpServer()
		const stored = {
			...defaultSettings(),
			tools: { enabled: [], autoApprove: [], mcp: [legacy] },
		}
		const settings = normalizeSettings(stored)
		expect(settings.tools.mcp[0]?.autoApproveTools).toEqual([])
	})

	it('keeps the per-tool auto-approve list of a server', () => {
		const stored = {
			...defaultSettings(),
			tools: { enabled: [], autoApprove: [], mcp: [mcpServer({ autoApproveTools: ['echo'] })] },
		}
		expect(normalizeSettings(stored).tools.mcp[0]?.autoApproveTools).toEqual(['echo'])
	})

	it('drops a malformed MCP server without resetting the rest of the document', () => {
		const stored = {
			...defaultSettings(),
			tools: {
				enabled: ['get_selection'],
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
		expect(settings.tools.enabled).toEqual(['get_selection'])
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

describe('memory settings', () => {
	it('enables memory by default with a bounded budget', () => {
		const settings = defaultSettings()
		expect(settings.memory).toEqual({ enabled: true, injectShare: 0.15, autoLimit: 3 })
		expect(settings.tools.enabled).toContain('remember')
		expect(settings.tools.enabled).toContain('recall')
		// Creating is auto-approved by the tool; updating an existing memory asks.
		expect(settings.tools.autoApprove).not.toContain('remember')
		expect(settings.tools.autoApprove).toContain('recall')
	})

	it('adds memory to a store written before memory existed', () => {
		const stored = {
			...defaultSettings(),
			version: 5,
			tools: { enabled: ['get_selection'], autoApprove: [] },
		}
		const settings = normalizeSettings(stored)
		expect(settings.version).toBe(SETTINGS_VERSION)
		expect(settings.memory.enabled).toBe(true)
		expect(settings.tools.enabled).toEqual(['get_selection', 'remember', 'recall', 'read_page'])
		expect(settings.tools.autoApprove).toEqual(['recall', 'read_page'])
	})

	it('keeps providers when the stored memory policy is malformed', () => {
		const stored = {
			...defaultSettings(),
			memory: { enabled: 'yes', injectShare: 9, autoLimit: -3 },
		}
		const settings = normalizeSettings(stored)
		expect(settings.providers[0]?.kind).toBe('prompt-api')
		expect(settings.memory).toEqual(defaultSettings().memory)
	})

	it('salvages the valid fields of a partially broken memory policy', () => {
		const stored = { ...defaultSettings(), memory: { enabled: false, injectShare: 9 } }
		const settings = normalizeSettings(stored)
		expect(settings.memory.enabled).toBe(false)
		expect(settings.memory.injectShare).toBe(0.15)
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

	it('ignores the memory tools when memory is turned off', () => {
		const memoryOnly = {
			...defaultSettings(),
			memory: { ...defaultSettings().memory, enabled: false },
			tools: { enabled: ['remember', 'recall'], autoApprove: [], mcp: [] },
		}
		expect(hasEnabledTools(memoryOnly)).toBe(false)
		expect(enabledBuiltInTools(memoryOnly)).toEqual([])

		const withPageTools = {
			...memoryOnly,
			tools: { ...memoryOnly.tools, enabled: ['remember', 'recall', 'read_page'] },
		}
		expect(enabledBuiltInTools(withPageTools)).toEqual(['read_page'])
	})
})
