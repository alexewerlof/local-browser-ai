import { Pencil, RefreshCw, Trash2 } from 'lucide-react'
import type { McpServerSettings } from '../core/types'
import {
	isMcpToolAutoApproved,
	isMcpToolEnabled,
	mcpServerAutoApproveSelection,
	mcpServerSelection,
	setMcpServerAutoApprove,
	setMcpServerEnabled,
	setMcpToolAutoApprove,
	setMcpToolEnabled,
} from '../core/tool-selection'
import type { McpCatalogEntry } from '../state/mcp'
import { Checkbox } from '../app/components/Checkbox'
import { SettingsCard } from './SettingsCard'
import { ToolRow } from './ToolRow'

/**
 * One MCP server, rendered as a tool set: the availability checkbox sits before its name,
 * the bulk auto-approve checkbox and the icon actions on the trailing edge, and one row per
 * discovered tool below. The tools are the same rows the built-in set uses, so the two
 * halves of Settings → Tools are one shape.
 */
export function McpServerCard({
	server,
	entry,
	onChange,
	onEdit,
	onRefresh,
	onRemove,
}: {
	server: McpServerSettings
	entry?: McpCatalogEntry
	onChange: (server: McpServerSettings) => void
	onEdit: () => void
	onRefresh: () => void
	onRemove: () => void
}) {
	const tools = entry?.tools ?? []
	const toolNames = tools.map((tool) => tool.name)
	const selection = mcpServerSelection(server, toolNames)
	const approvedSelection = mcpServerAutoApproveSelection(server, toolNames)

	return (
		<SettingsCard
			title={server.label}
			titleBefore={
				<Checkbox
					label={`Enable ${server.label}`}
					checked={selection === 'all'}
					indeterminate={selection === 'some'}
					onChange={(checked) => onChange(setMcpServerEnabled(server, checked))}
				/>
			}
			titleAfter={
				<>
					<span className="badge">http</span>
					{server.stripOrigin && <span className="badge">no Origin</span>}
					<StatusBadge status={entry?.status ?? 'idle'} tools={tools.length} />
				</>
			}
			hint={server.url}
			actions={
				<>
					<span className="group__auto" title="Run without asking">
						<span className="group__auto-label">Auto-approve</span>
						<Checkbox
							label={`Run ${server.label} tools without asking`}
							checked={approvedSelection === 'all'}
							indeterminate={approvedSelection === 'some'}
							disabled={!server.enabled}
							onChange={(checked) => onChange(setMcpServerAutoApprove(server, checked))}
						/>
					</span>
					<button
						type="button"
						className="button button--ghost button--icon button--sm"
						title="Refresh"
						aria-label={`Refresh ${server.label}`}
						onClick={onRefresh}
					>
						<RefreshCw size={16} />
					</button>
					<button
						type="button"
						className="button button--ghost button--icon button--sm"
						title="Edit"
						aria-label={`Edit ${server.label}`}
						onClick={onEdit}
					>
						<Pencil size={16} />
					</button>
					<button
						type="button"
						className="button button--ghost button--icon button--sm button--danger"
						title="Remove"
						aria-label={`Remove ${server.label}`}
						onClick={onRemove}
					>
						<Trash2 size={16} />
					</button>
				</>
			}
			className="mcp-server"
		>
			{entry?.error && <div className="notice notice--bad">{entry.error}</div>}

			{tools.length > 0 ? (
				<div className="rows">
					{tools.map((tool) => (
						<ToolRow
							key={tool.name}
							label={tool.title || tool.name}
							badges={
								<>
									<span className="badge">{tool.name}</span>
									{tool.readOnly && <span className="badge">read-only</span>}
								</>
							}
							description={tool.description}
							enabled={isMcpToolEnabled(server, tool.name)}
							autoApprove={isMcpToolAutoApproved(server, tool.name)}
							disabled={!server.enabled}
							onEnabledChange={(checked) => onChange(setMcpToolEnabled(server, tool.name, checked))}
							onAutoApproveChange={(checked) =>
								onChange(setMcpToolAutoApprove(server, toolNames, tool.name, checked))
							}
						/>
					))}
				</div>
			) : (
				<p className="card__note">{describeEmptyState(entry)}</p>
			)}
		</SettingsCard>
	)
}

function StatusBadge({ status, tools }: { status: McpCatalogEntry['status']; tools: number }) {
	if (status === 'loading') return <span className="badge">checking…</span>
	if (status === 'ready') return <span className="badge badge--accent">{tools} tools</span>
	if (status === 'error') return <span className="badge badge--danger">unreachable</span>
	return <span className="badge">not checked</span>
}

/** Why the card has no tool rows; an unreachable server already says so in its notice. */
function describeEmptyState(entry: McpCatalogEntry | undefined): string {
	if (!entry || entry.status === 'idle') return 'Not checked yet. Refresh to list the tools this server offers.'
	if (entry.status === 'loading') return 'Checking the server…'
	if (entry.status === 'error') return 'The tools are unknown while the server cannot be reached.'
	return 'This server offers no tools.'
}
