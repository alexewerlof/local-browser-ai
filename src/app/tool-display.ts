import {
	BookOpen,
	Clock,
	Database,
	MemoryStick,
	PocketKnife,
	Search,
	TextSelect,
	Wrench,
	type LucideIcon,
} from 'lucide-react'
import { isMemoryToolId } from '../core/memory'
import type { ToolCallPart, ToolCallState } from '../core/types'

/**
 * What a step says it is doing, keyed by tool name. The tool's own name is the fallback,
 * which is what an MCP tool gets: its label names the server above the row.
 */
export const TOOL_LABELS: Record<string, string> = {
	read_page: 'Reading page',
	get_selection: 'Reading selection',
	get_current_datetime: 'Checking the clock',
	search_web: 'Searching the web',
	remember: 'Saving to memory',
	recall: 'Searching memory',
}

/** The badge always reads as prose; the enum value is never shown to the user. */
export const TOOL_STATE_LABELS: Record<ToolCallState, string> = {
	pending: 'waiting',
	running: 'running',
	complete: 'done',
	error: 'failed',
	denied: 'denied',
}

const TOOL_ICONS: Record<string, LucideIcon> = {
	read_page: BookOpen,
	get_selection: TextSelect,
	get_current_datetime: Clock,
	search_web: Search,
	remember: MemoryStick,
	recall: Database,
}

/**
 * The mark a step carries: the tool's own icon, memory for a memory tool, the MCP mark
 * for a remote call, and the wrench when nothing better is known about it.
 */
export function toolIcon(part: ToolCallPart): LucideIcon {
	if (part.server) return PocketKnife
	return TOOL_ICONS[part.toolName] ?? (isMemoryToolId(part.toolName) ? MemoryStick : Wrench)
}

/**
 * The page handle a tool reported attaching, if any.
 *
 * A tool that opened a tab either attached it (and says so with `added: true` plus the
 * handle) or did not. Only the first case means the card has nothing left to offer, and
 * the steps group has nothing to wait for.
 */
export function attachedPageOf(output: unknown): string | undefined {
	if (typeof output !== 'object' || output === null) return undefined
	const record = output as Record<string, unknown>
	if (record.added !== true) return undefined
	return typeof record.page === 'string' ? record.page : undefined
}
