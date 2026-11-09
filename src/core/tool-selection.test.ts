import { describe, expect, it } from 'vitest'
import {
	builtInAutoApproveSelection,
	builtInSelection,
	isMcpToolAutoApproved,
	isMcpToolEnabled,
	mcpServerAutoApproveSelection,
	mcpServerSelection,
	selectionState,
	setBuiltInAutoApprove,
	setBuiltInEnabled,
	setMcpServerAutoApprove,
	setMcpServerEnabled,
	setMcpToolAutoApprove,
	setMcpToolEnabled,
	setToolInList,
} from './tool-selection'
import { ACTION_TOOL_IDS, BUILT_IN_TOOL_IDS, READ_ONLY_TOOL_IDS } from './settings'
import type { McpServerSettings } from './types'

const ALL_BUILT_INS = [...BUILT_IN_TOOL_IDS]

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

describe('selectionState', () => {
	it('is empty when nothing is selected and full when everything is', () => {
		expect(selectionState(0, 3)).toBe('none')
		expect(selectionState(3, 3)).toBe('all')
		expect(selectionState(1, 3)).toBe('some')
	})

	it('never claims a partial state over an empty list', () => {
		expect(selectionState(0, 0)).toBe('none')
	})
})

describe('built-in tools', () => {
	it('covers every id this build knows about', () => {
		expect(ALL_BUILT_INS).toEqual([...READ_ONLY_TOOL_IDS, ...ACTION_TOOL_IDS])
	})

	it('reads the group from the enabled list', () => {
		expect(builtInSelection(ALL_BUILT_INS)).toBe('all')
		expect(builtInSelection(['read_page'])).toBe('some')
		expect(builtInSelection([])).toBe('none')
	})

	it('writes the whole list, so a group click is one write', () => {
		expect(setBuiltInEnabled(['read_page'], true).sort()).toEqual([...ALL_BUILT_INS].sort())
		expect(setBuiltInEnabled(ALL_BUILT_INS, false)).toEqual([])
	})

	it('keeps ids a newer build added instead of truncating the store', () => {
		expect(setBuiltInEnabled(['future_tool'], true)).toContain('future_tool')
	})

	it('defaults to a partial auto-approve set', () => {
		// The shipped store approves the read-only tools only.
		expect(builtInAutoApproveSelection([...READ_ONLY_TOOL_IDS])).toBe('some')
		expect(builtInAutoApproveSelection(ALL_BUILT_INS)).toBe('all')
		expect(builtInAutoApproveSelection([])).toBe('none')
		expect(setBuiltInAutoApprove(['read_page'], true).sort()).toEqual([...ALL_BUILT_INS].sort())
		expect(setBuiltInAutoApprove(ALL_BUILT_INS, false)).toEqual([])
	})
})

describe('MCP server selection', () => {
	it('is empty while the server is switched off, whatever its tools say', () => {
		expect(mcpServerSelection(server({ enabled: false }), ['echo'])).toBe('none')
	})

	it('is full when the server is on and no tool is opted out', () => {
		expect(mcpServerSelection(server(), ['echo', 'fetch'])).toBe('all')
	})

	it('is partial when the server is on with some tools off', () => {
		expect(mcpServerSelection(server({ disabledTools: ['echo'] }), ['echo', 'fetch'])).toBe('some')
	})

	it('treats an undiscovered server as on', () => {
		expect(mcpServerSelection(server(), [])).toBe('all')
	})

	it('keeps the per-tool opt-outs when the server is switched off', () => {
		const next = setMcpServerEnabled(server({ disabledTools: ['echo'] }), false)
		expect(next.enabled).toBe(false)
		expect(next.disabledTools).toEqual(['echo'])
	})

	it('clears the opt-outs when the group is switched on', () => {
		const next = setMcpServerEnabled(server({ disabledTools: ['echo'] }), true)
		expect(next.enabled).toBe(true)
		expect(next.disabledTools).toEqual([])
	})

	it('toggles one tool without touching the server flag', () => {
		expect(isMcpToolEnabled(server(), 'echo')).toBe(true)
		const off = setMcpToolEnabled(server(), 'echo', false)
		expect(off.disabledTools).toEqual(['echo'])
		expect(off.enabled).toBe(true)
		expect(setMcpToolEnabled(off, 'echo', true).disabledTools).toEqual([])
	})
})

describe('MCP auto-approve', () => {
	it('lets the server flag win over the per-tool list', () => {
		const trusted = server({ autoApprove: true })
		expect(isMcpToolAutoApproved(trusted, 'echo')).toBe(true)
		expect(mcpServerAutoApproveSelection(trusted, ['echo'])).toBe('all')
	})

	it('is partial when only some tools are listed', () => {
		const mixed = server({ autoApproveTools: ['echo'] })
		expect(mcpServerAutoApproveSelection(mixed, ['echo', 'fetch'])).toBe('some')
		expect(isMcpToolAutoApproved(mixed, 'fetch')).toBe(false)
	})

	it('switching the group on sets the flag and clears the list', () => {
		const next = setMcpServerAutoApprove(server({ autoApproveTools: ['echo'] }), true)
		expect(next.autoApprove).toBe(true)
		expect(next.autoApproveTools).toEqual([])
	})

	it('adds one tool while the flag is off', () => {
		const next = setMcpToolAutoApprove(server(), ['echo', 'fetch'], 'fetch', true)
		expect(next.autoApprove).toBe(false)
		expect(next.autoApproveTools).toEqual(['fetch'])
	})

	it('leaves the list alone when the tool is already approved by the flag', () => {
		const trusted = server({ autoApprove: true })
		expect(setMcpToolAutoApprove(trusted, ['echo'], 'echo', true)).toBe(trusted)
	})

	it('removes one tool from the list while the flag is off', () => {
		const next = setMcpToolAutoApprove(
			server({ autoApproveTools: ['echo', 'fetch'] }),
			['echo', 'fetch'],
			'echo',
			false,
		)
		expect(next.autoApproveTools).toEqual(['fetch'])
	})

	it('decomposes the server flag so one switch can still be turned off', () => {
		// The user trusted the server, then untrusted one tool: the rest stay trusted.
		const next = setMcpToolAutoApprove(server({ autoApprove: true }), ['echo', 'fetch'], 'echo', false)
		expect(next.autoApprove).toBe(false)
		expect(next.autoApproveTools).toEqual(['fetch'])
		expect(isMcpToolAutoApproved(next, 'echo')).toBe(false)
		expect(isMcpToolAutoApproved(next, 'fetch')).toBe(true)
	})
})

describe('setToolInList', () => {
	it('adds an id once and removes only that id', () => {
		expect(setToolInList(['a'], 'b', true)).toEqual(['a', 'b'])
		expect(setToolInList(['a', 'b'], 'b', true)).toEqual(['a', 'b'])
		expect(setToolInList(['a', 'b'], 'a', false)).toEqual(['b'])
	})
})
