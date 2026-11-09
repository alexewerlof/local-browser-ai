// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { mcpServerKey } from '../../core/mcp'
import { defaultSettings } from '../../core/settings'
import type { AppSettings, McpServerSettings } from '../../core/types'
import { mcpCatalogStore } from '../../state/mcp'
import { ToolTree } from './ToolTree'

// Discovery would connect to a real endpoint; the tree only reads the catalog.
vi.mock('../../state/mcp', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../state/mcp')>()
	return { ...actual, refreshMcpServers: vi.fn(async () => {}) }
})

afterEach(cleanup)

beforeEach(() => {
	mcpCatalogStore.set({})
})

function server(overrides: Partial<McpServerSettings> = {}): McpServerSettings {
	return {
		id: 'mcp_1',
		label: 'Mock tools',
		url: 'http://127.0.0.1:9000/mcp',
		headers: {},
		enabled: true,
		autoApprove: false,
		autoApproveTools: [],
		disabledTools: [],
		stripOrigin: false,
		...overrides,
	}
}

function settingsWith(overrides: Partial<AppSettings['tools']> = {}): AppSettings {
	const base = defaultSettings()
	return { ...base, tools: { ...base.tools, ...overrides } }
}

function renderTree(settings: AppSettings) {
	const onChange = vi.fn()
	const view = render(<ToolTree settings={settings} onChange={onChange} onClose={() => {}} />)
	return { ...view, onChange }
}

/** The built-in node is the first group head; MCP servers follow it. */
function groupHead(container: HTMLElement, index = 0): HTMLElement | null {
	return container.querySelectorAll<HTMLElement>('.tool-tree__head')[index] ?? null
}

describe('ToolTree', () => {
	it('starts collapsed with the built-in set fully on', () => {
		const { container } = renderTree(settingsWith())

		const head = groupHead(container)
		const checkbox = head?.querySelector<HTMLInputElement>('.checkbox')
		expect(checkbox?.checked).toBe(true)
		expect(checkbox?.indeterminate).toBe(false)

		const toggle = head?.querySelector<HTMLButtonElement>('.tool-tree__toggle')
		expect(toggle?.textContent).toContain('Built-in')
		expect(toggle?.getAttribute('aria-expanded')).toBe('false')
		expect(toggle?.getAttribute('aria-controls')).toBeNull()
		expect(container.querySelectorAll('.tool-tree__row')).toHaveLength(0)
	})

	it('shows a partial built-in set and expands into one row per tool', () => {
		const { container } = renderTree(settingsWith({ enabled: ['read_page'] }))

		const checkbox = groupHead(container)?.querySelector<HTMLInputElement>('.checkbox')
		expect(checkbox?.checked).toBe(false)
		expect(checkbox?.indeterminate).toBe(true)

		const toggle = groupHead(container)?.querySelector<HTMLButtonElement>('.tool-tree__toggle')
		if (toggle) fireEvent.click(toggle)

		expect(toggle?.getAttribute('aria-expanded')).toBe('true')
		expect(toggle?.getAttribute('aria-controls')).toBe('built-in-tools')
		const rows = container.querySelectorAll('.tool-tree__row')
		expect(rows).toHaveLength(6)
		// Name above description, and no icon: the row is text only.
		expect(rows[0]?.querySelector('.popover__item-main')?.textContent).toBe('Read page')
		expect(rows[0]?.querySelector('.popover__item-sub')?.textContent).toMatch(/outline/)
		expect(rows[0]?.querySelector('svg')).toBeNull()
	})

	it('writes the built-in list when one tool or the whole set is clicked', () => {
		const { container, onChange } = renderTree(settingsWith())

		fireEvent.click(groupHead(container)?.querySelector<HTMLInputElement>('.checkbox') as HTMLInputElement)
		expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: [] }))

		const toggle = groupHead(container)?.querySelector<HTMLButtonElement>('.tool-tree__toggle')
		if (toggle) fireEvent.click(toggle)
		const readPage = container.querySelectorAll<HTMLInputElement>('.tool-tree__row .checkbox')[0]
		if (readPage) fireEvent.click(readPage)

		const written = onChange.mock.calls.at(-1)?.[0] as AppSettings['tools']
		expect(written.enabled).not.toContain('read_page')
		expect(written.enabled).toContain('search_web')
	})

	it('renders a server as a peer group with its discovered tools', () => {
		const local = server()
		mcpCatalogStore.set({
			[mcpServerKey(local)]: {
				status: 'ready',
				tools: [
					{ name: 'echo', description: 'Echo the input back', inputSchema: {}, readOnly: false },
					{ name: 'fetch', description: 'Fetch a page', inputSchema: {}, readOnly: true },
				],
			},
		})
		const { container, onChange } = renderTree(settingsWith({ mcp: [local] }))

		const head = groupHead(container, 1)
		expect(head?.textContent).toContain('Mock tools')
		expect(head?.textContent).toContain('2 of 2 tools enabled')
		expect(head?.querySelector<HTMLInputElement>('.checkbox')?.checked).toBe(true)

		const toggle = head?.querySelector<HTMLButtonElement>('.tool-tree__toggle')
		if (toggle) fireEvent.click(toggle)
		expect(container.querySelectorAll('.tool-tree__row')).toHaveLength(2)

		const echo = container.querySelectorAll<HTMLInputElement>('.tool-tree__row .checkbox')[0]
		if (echo) fireEvent.click(echo)
		const written = onChange.mock.calls.at(-1)?.[0] as AppSettings['tools']
		expect(written.mcp[0]?.disabledTools).toEqual(['echo'])
	})

	it('explains an unreachable server and treats its unknown tools as on', () => {
		const unreachable = server()
		mcpCatalogStore.set({
			[mcpServerKey(unreachable)]: { status: 'error', tools: [], error: 'HTTP 403' },
		})
		const { container } = renderTree(settingsWith({ mcp: [unreachable] }))

		const head = groupHead(container, 1)
		expect(head?.textContent).toContain('Unreachable')
		// No tool list means nothing known to be off, so the set reads as on.
		const checkbox = head?.querySelector<HTMLInputElement>('.checkbox')
		expect(checkbox?.checked).toBe(true)
		expect(checkbox?.indeterminate).toBe(false)

		const toggle = head?.querySelector<HTMLButtonElement>('.tool-tree__toggle')
		if (toggle) fireEvent.click(toggle)
		expect(container.querySelector('.tool-tree__hint')?.textContent).toBe('Unreachable')
	})

	it('dashes a server whose tools are partly off', () => {
		const partial = server({ disabledTools: ['echo'] })
		mcpCatalogStore.set({
			[mcpServerKey(partial)]: {
				status: 'ready',
				tools: [
					{ name: 'echo', description: 'Echo', inputSchema: {}, readOnly: false },
					{ name: 'add', description: 'Add', inputSchema: {}, readOnly: false },
				],
			},
		})
		const { container } = renderTree(settingsWith({ mcp: [partial] }))

		const checkbox = groupHead(container, 1)?.querySelector<HTMLInputElement>('.checkbox')
		expect(checkbox?.checked).toBe(false)
		expect(checkbox?.indeterminate).toBe(true)
	})

	it('switches a whole server off without dropping its per-tool opt-outs', () => {
		const off = server({ enabled: false, disabledTools: ['echo'] })
		mcpCatalogStore.set({
			[mcpServerKey(off)]: {
				status: 'ready',
				tools: [{ name: 'echo', description: 'Echo', inputSchema: {}, readOnly: false }],
			},
		})
		const { container, onChange } = renderTree(settingsWith({ mcp: [off] }))

		const checkbox = groupHead(container, 1)?.querySelector<HTMLInputElement>('.checkbox')
		expect(checkbox?.checked).toBe(false)
		expect(checkbox?.indeterminate).toBe(false)

		const toggle = groupHead(container, 1)?.querySelector<HTMLButtonElement>('.tool-tree__toggle')
		if (toggle) fireEvent.click(toggle)
		expect(container.querySelector<HTMLInputElement>('.tool-tree__row .checkbox')?.disabled).toBe(true)

		if (checkbox) fireEvent.click(checkbox)
		const written = onChange.mock.calls.at(-1)?.[0] as AppSettings['tools']
		expect(written.mcp[0]?.enabled).toBe(true)
		expect(written.mcp[0]?.disabledTools).toEqual([])
	})
})
