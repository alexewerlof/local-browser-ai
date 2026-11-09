/**
 * Which tools are on, as both tool surfaces ask it: the composer's Tools tree and
 * Settings → Tools render the same tri-state group checkboxes and per-tool checkboxes, so
 * the rules live here instead of being derived twice.
 *
 * A group's state comes from its members, except for an MCP server that is switched off:
 * its tools never reach a request, so the group reads as unchecked whatever the per-tool
 * lists say. Turning the group on clears the per-tool opt-outs, because "on" means all of
 * them; turning it off keeps them, so switching the server back on restores the choices.
 */

import { BUILT_IN_TOOL_IDS } from './settings'
import type { McpServerSettings } from './types'

/** A checkbox that can be empty, full, or partial (VS Code's toolbar shows the same three). */
export type SelectionState = 'all' | 'some' | 'none'

export function selectionState(selected: number, total: number): SelectionState {
	if (total <= 0 || selected <= 0) return 'none'
	return selected >= total ? 'all' : 'some'
}

function stateOf<T>(items: readonly T[], isSelected: (item: T) => boolean): SelectionState {
	return selectionState(items.filter(isSelected).length, items.length)
}

/** Toggle one id in a list of tool ids. */
export function setToolInList(ids: readonly string[], id: string, selected: boolean): string[] {
	if (selected) return ids.includes(id) ? [...ids] : [...ids, id]
	return ids.filter((entry) => entry !== id)
}

// ------------------------------------------------------------------ built-in tools

export function builtInSelection(enabled: readonly string[]): SelectionState {
	return stateOf(BUILT_IN_TOOL_IDS, (id) => enabled.includes(id))
}

export function setBuiltInEnabled(enabled: readonly string[], selected: boolean): string[] {
	if (!selected) return []
	// Keep ids this build does not know about: `normalizeSettings` drops them, and dropping
	// them here would silently rewrite a store written by a newer version.
	const known = new Set(enabled)
	for (const id of BUILT_IN_TOOL_IDS) known.add(id)
	return [...known]
}

export function builtInAutoApproveSelection(autoApprove: readonly string[]): SelectionState {
	return stateOf(BUILT_IN_TOOL_IDS, (id) => autoApprove.includes(id))
}

export function setBuiltInAutoApprove(autoApprove: readonly string[], selected: boolean): string[] {
	if (!selected) return []
	const known = new Set(autoApprove)
	for (const id of BUILT_IN_TOOL_IDS) known.add(id)
	return [...known]
}

// --------------------------------------------------------------------- MCP servers

export function isMcpToolEnabled(server: McpServerSettings, toolName: string): boolean {
	return !server.disabledTools.includes(toolName)
}

export function setMcpToolEnabled(server: McpServerSettings, toolName: string, selected: boolean): McpServerSettings {
	const disabled = new Set(server.disabledTools)
	if (selected) disabled.delete(toolName)
	else disabled.add(toolName)
	return { ...server, disabledTools: [...disabled] }
}

export function mcpServerSelection(server: McpServerSettings, toolNames: readonly string[]): SelectionState {
	// Not probed yet: the server flag is the only thing known, and that is what it means.
	if (!server.enabled) return 'none'
	if (toolNames.length === 0) return 'all'
	return stateOf(toolNames, (name) => isMcpToolEnabled(server, name))
}

export function setMcpServerEnabled(server: McpServerSettings, selected: boolean): McpServerSettings {
	// Off keeps `disabledTools` so switching it back on restores the previous choice; on
	// clears them, because the checkbox the user just ticked means every tool of the server.
	return selected ? { ...server, enabled: true, disabledTools: [] } : { ...server, enabled: false }
}

/** The server-wide flag wins, so a single tool cannot be trusted off while every tool runs. */
export function isMcpToolAutoApproved(server: McpServerSettings, toolName: string): boolean {
	return server.autoApprove || server.autoApproveTools.includes(toolName)
}

export function mcpServerAutoApproveSelection(server: McpServerSettings, toolNames: readonly string[]): SelectionState {
	if (server.autoApprove) return 'all'
	return stateOf(toolNames, (name) => server.autoApproveTools.includes(name))
}

export function setMcpServerAutoApprove(server: McpServerSettings, selected: boolean): McpServerSettings {
	// The flag covers every tool this server will ever offer, known or not yet discovered,
	// so the per-tool list is cleared either way.
	return { ...server, autoApprove: selected, autoApproveTools: [] }
}

/**
 * Turning one tool's approval on while the server flag is off just adds it. Turning one off
 * while the flag is on decomposes the flag into the list of the tools the user kept, because
 * a single switch must stay reachable once the group is no longer all-on.
 */
export function setMcpToolAutoApprove(
	server: McpServerSettings,
	toolNames: readonly string[],
	toolName: string,
	selected: boolean,
): McpServerSettings {
	if (selected) {
		if (isMcpToolAutoApproved(server, toolName)) return server
		return { ...server, autoApproveTools: [...server.autoApproveTools, toolName] }
	}

	if (!server.autoApprove) {
		return {
			...server,
			autoApproveTools: server.autoApproveTools.filter((name) => name !== toolName),
		}
	}

	return {
		...server,
		autoApprove: false,
		autoApproveTools: toolNames.filter((name) => name !== toolName),
	}
}
