import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ToolCallPart } from '../../core/types'
import { approvalsStore, resolveApproval, toolTabsStore } from '../../state/browser'
import { addTabPage } from '../../state/bootstrap'
import { attachedPageOf, TOOL_LABELS, TOOL_STATE_LABELS, toolIcon } from '../tool-display'
import { useStore } from '../useStore'

function preview(value: unknown, limit = 700): string {
	if (value === undefined) return ''
	const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
	return text.length > limit ? `${text.slice(0, limit)}\n…` : text
}

export function ToolCallCard({ part }: { part: ToolCallPart }) {
	const [open, setOpen] = useState(false)
	const approvals = useStore(approvalsStore)
	const approval = approvals.find((entry) => entry.id === part.toolCallId)
	// A tool that opens a tab keeps it here as a manual fallback: the page is offered while
	// the access request is still open, and the button is the way back in if it was denied.
	const toolTabId = useStore(toolTabsStore).get(part.toolCallId)
	// Once the tool has attached that page itself, offering to add it again would only put
	// a second copy of the same document in the chat.
	const alreadyAdded = attachedPageOf(part.output) !== undefined
	const label = part.label ?? TOOL_LABELS[part.toolName] ?? part.toolName
	const Icon = toolIcon(part)

	return (
		<div className={`tool tool--${part.state}`} data-state={part.state}>
			<button
				type="button"
				className="tool__head"
				aria-expanded={open}
				onClick={() => setOpen((value) => !value)}
			>
				<Icon size={13} />
				<span className="tool__name">{label}</span>
				{part.server && <span className="badge">MCP · {part.server}</span>}
				<span className="tool__arg">{summarizeInput(part)}</span>
				<span className="spacer" />
				{/* Done is the quiet default; a state the user has to act on keeps its badge. */}
				{part.state !== 'complete' && (
					<span className={`badge${part.state === 'error' ? ' badge--danger' : ''}`}>
						{TOOL_STATE_LABELS[part.state]}
					</span>
				)}
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

			{toolTabId !== undefined && !alreadyAdded && (
				<div className="tool__action">
					<button type="button" className="button button--sm" onClick={() => void addTabPage(toolTabId)}>
						Add page to chat
					</button>
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
	for (const key of ['heading', 'query', 'section', 'url', 'text', 'title']) {
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
