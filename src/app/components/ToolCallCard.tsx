import { useState } from 'react'
import { ChevronDown, ChevronRight, PocketKnife, Wrench } from 'lucide-react'
import type { ToolCallPart } from '../../core/types'
import { resolveApproval } from '../../state/browser'
import { useStore } from '../useStore'
import { approvalsStore } from '../../state/browser'

const TOOL_LABELS: Record<string, string> = {
	read_attached_page: 'Reading page',
	get_page_outline: 'Page outline',
	read_page_section: 'Reading section',
	find_in_page: 'Searching page',
	get_selection: 'Reading selection',
	get_current_datetime: 'Checking the clock',
	search_web: 'Searching the web',
	open_url: 'Opening link',
}

function preview(value: unknown, limit = 700): string {
	if (value === undefined) return ''
	const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
	return text.length > limit ? `${text.slice(0, limit)}\n…` : text
}

export function ToolCallCard({ part }: { part: ToolCallPart }) {
	const [open, setOpen] = useState(false)
	const approvals = useStore(approvalsStore)
	const approval = approvals.find((entry) => entry.id === part.toolCallId)
	const label = part.label ?? TOOL_LABELS[part.toolName] ?? part.toolName
	// MCP tools come from a remote server, so they carry the MCP mark instead of the wrench.
	const Icon = part.server ? PocketKnife : Wrench

	return (
		<div className={`tool tool--${part.state}`}>
			<button type="button" className="tool__head" onClick={() => setOpen((value) => !value)}>
				<Icon size={13} />
				<span className="tool__name">{label}</span>
				{part.server && <span className="badge">MCP · {part.server}</span>}
				<span className="tool__arg">{summarizeInput(part)}</span>
				<span className="spacer" />
				<span className={`badge${part.state === 'error' ? ' badge--danger' : ''}`}>
					{part.state === 'running' ? 'running' : part.state === 'pending' ? 'waiting' : part.state}
				</span>
				{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
			</button>

			{approval && (
				<div className="tool__approval">
					<span>Allow this action?</span>
					<code>{preview(approval.input, 160)}</code>
					<div className="row" style={{ gap: 'var(--space-3)' }}>
						<button
							type="button"
							className="button button--primary button--sm"
							onClick={() => resolveApproval(approval.id, true)}
						>
							Allow
						</button>
						<button
							type="button"
							className="button button--sm"
							onClick={() => resolveApproval(approval.id, false)}
						>
							Deny
						</button>
					</div>
				</div>
			)}

			{open && (
				<div className="tool__body">
					<div className="tool__section">
						<span className="label">Input</span>
						<pre>{preview(part.input)}</pre>
					</div>
					{part.output !== undefined && (
						<div className="tool__section">
							<span className="label">Output</span>
							<pre>{preview(part.output)}</pre>
						</div>
					)}
					{part.error && (
						<div className="tool__section">
							<span className="label">Error</span>
							<pre>{part.error}</pre>
						</div>
					)}
				</div>
			)}
		</div>
	)
}

function summarizeInput(part: ToolCallPart): string {
	if (typeof part.input !== 'object' || part.input === null) return ''
	const record = part.input as Record<string, unknown>
	for (const key of ['heading', 'query', 'section', 'url']) {
		const value = record[key]
		if (typeof value === 'string' && value) return trim(value)
	}
	// MCP tools have arbitrary argument names, so fall back to the first scalar.
	for (const value of Object.values(record)) {
		if (typeof value === 'string' && value) return trim(value)
		if (typeof value === 'number' || typeof value === 'boolean') return String(value)
	}
	return ''
}

function trim(value: string): string {
	return value.length > 60 ? `${value.slice(0, 60)}…` : value
}
