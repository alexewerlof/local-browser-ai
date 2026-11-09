import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { AppSettings, ToolSettings } from '../../core/types'
import { TOOL_DEFINITIONS } from '../../browser/tools'
import { mcpServerKey } from '../../core/mcp'
import {
	builtInSelection,
	isMcpToolEnabled,
	mcpServerSelection,
	setBuiltInEnabled,
	setMcpServerEnabled,
	setMcpToolEnabled,
	setToolInList,
} from '../../core/tool-selection'
import { mcpCatalogStore, refreshMcpServers, type McpCatalogEntry } from '../../state/mcp'
import { useStore } from '../useStore'
import { Checkbox } from './Checkbox'
import { SettingsButton } from './SettingsButton'

/** The built-in set is one node of the tree; a server node is keyed by its server id. */
const BUILT_IN_GROUP = 'built-in'

/**
 * The Tools menu body: one expandable tree of tool sets. The built-in tools are a set at the
 * same level as each MCP server, so a built-in tool and an MCP tool are switched the same
 * way. Only availability lives here — auto-approve is a policy question and belongs in
 * Settings → Tools, which the gear opens.
 */
export function ToolTree({
	settings,
	onChange,
	onClose,
}: {
	settings: AppSettings
	onChange: (tools: ToolSettings) => void
	onClose: () => void
}) {
	const catalog = useStore(mcpCatalogStore)
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
	const servers = settings.tools.mcp

	const signature = servers.map((server) => `${mcpServerKey(server)}:${server.enabled}`).join('|')
	useEffect(() => {
		if (servers.length === 0) return
		void refreshMcpServers(servers)
		// A tool list is worth re-checking when a server is added, edited or switched on,
		// not on every setting the panel writes while the menu is open.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [signature])

	const toggleExpanded = (id: string) =>
		setExpanded((current) => {
			const next = new Set(current)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})

	const update = (patch: Partial<ToolSettings>) => onChange({ ...settings.tools, ...patch })

	const enabled = settings.tools.enabled
	const builtInState = builtInSelection(enabled)

	return (
		<>
			<div className="popover__header">
				<span className="popover__group-label">Tools</span>
				<SettingsButton section="tools" label="Manage tools" onClose={onClose} />
			</div>
			<div className="popover__list">
				<ul className="tool-tree">
					<li className="tool-tree__group">
						<div className="tool-tree__head">
							<Checkbox
								label="Enable every built-in tool"
								checked={builtInState === 'all'}
								indeterminate={builtInState === 'some'}
								onChange={(checked) => update({ enabled: setBuiltInEnabled(enabled, checked) })}
							/>
							<button
								type="button"
								className="tool-tree__toggle"
								aria-expanded={expanded.has(BUILT_IN_GROUP)}
								aria-controls={expanded.has(BUILT_IN_GROUP) ? `${BUILT_IN_GROUP}-tools` : undefined}
								title={expanded.has(BUILT_IN_GROUP) ? 'Collapse' : 'Expand'}
								onClick={() => toggleExpanded(BUILT_IN_GROUP)}
							>
								{expanded.has(BUILT_IN_GROUP) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
								<span className="tool-tree__label">Built-in</span>
							</button>
						</div>
						{expanded.has(BUILT_IN_GROUP) && (
							<ul className="tool-tree__tools" id={`${BUILT_IN_GROUP}-tools`}>
								{TOOL_DEFINITIONS.map((definition) => (
									<ToolLeaf
										key={definition.id}
										label={definition.label}
										description={definition.description}
										checked={enabled.includes(definition.id)}
										onChange={(checked) =>
											update({ enabled: setToolInList(enabled, definition.id, checked) })
										}
									/>
								))}
							</ul>
						)}
					</li>

					{servers.map((server) => {
						const entry = catalog[mcpServerKey(server)]
						const toolNames = (entry?.tools ?? []).map((tool) => tool.name)
						const state = mcpServerSelection(server, toolNames)

						return (
							<li key={server.id} className="tool-tree__group">
								<div className="tool-tree__head">
									<Checkbox
										label={`Enable ${server.label}`}
										checked={state === 'all'}
										indeterminate={state === 'some'}
										onChange={(checked) =>
											update({
												mcp: replaceServer(servers, setMcpServerEnabled(server, checked)),
											})
										}
									/>
									<button
										type="button"
										className="tool-tree__toggle"
										aria-expanded={expanded.has(server.id)}
										aria-controls={expanded.has(server.id) ? `${server.id}-tools` : undefined}
										title={expanded.has(server.id) ? 'Collapse' : 'Expand'}
										onClick={() => toggleExpanded(server.id)}
									>
										{expanded.has(server.id) ? (
											<ChevronDown size={12} />
										) : (
											<ChevronRight size={12} />
										)}
										<span className="tool-tree__label">{server.label}</span>
									</button>
									<span className="tool-tree__meta">{mcpStatus(server, entry)}</span>
								</div>
								{expanded.has(server.id) && (
									<ul className="tool-tree__tools" id={`${server.id}-tools`}>
										{entry && entry.tools.length > 0 ? (
											entry.tools.map((tool) => (
												<ToolLeaf
													key={tool.name}
													label={tool.title || tool.name}
													description={tool.description}
													checked={isMcpToolEnabled(server, tool.name)}
													disabled={!server.enabled}
													onChange={(checked) =>
														update({
															mcp: replaceServer(
																servers,
																setMcpToolEnabled(server, tool.name, checked),
															),
														})
													}
												/>
											))
										) : (
											<li className="tool-tree__hint">{describeEmptyState(entry)}</li>
										)}
									</ul>
								)}
							</li>
						)
					})}
				</ul>
				{servers.length === 0 && <p className="popover__empty">No MCP servers yet.</p>}
			</div>
		</>
	)
}

/** One tool under a set: the same row shape as Settings, minus the approval switch. */
function ToolLeaf({
	label,
	description,
	checked,
	disabled,
	onChange,
}: {
	label: string
	description?: string
	checked: boolean
	disabled?: boolean
	onChange: (checked: boolean) => void
}) {
	return (
		<li>
			<label className="tool-tree__row">
				<Checkbox label={`Enable ${label}`} checked={checked} disabled={disabled} onChange={onChange} />
				<span className="tool-tree__text">
					<span className="popover__item-main">{label}</span>
					{description && <span className="popover__item-sub">{description}</span>}
				</span>
			</label>
		</li>
	)
}

function replaceServer(
	servers: AppSettings['tools']['mcp'],
	next: AppSettings['tools']['mcp'][number],
): AppSettings['tools']['mcp'] {
	return servers.map((server) => (server.id === next.id ? next : server))
}

/** The one line beside a server name: what its tools are doing, or why they are not. */
function mcpStatus(server: AppSettings['tools']['mcp'][number], entry: McpCatalogEntry | undefined): string {
	// A switched-off server still has a tool list; saying how many are "enabled" beside an
	// unchecked box would contradict the box.
	if (!server.enabled) return 'Off'
	if (!entry || entry.status === 'idle') return 'Not checked'
	if (entry.status === 'loading') return 'Checking…'
	if (entry.status === 'error') return 'Unreachable'
	const available = entry.tools.filter((tool) => isMcpToolEnabled(server, tool.name)).length
	return `${available} of ${entry.tools.length} tools enabled`
}

function describeEmptyState(entry: McpCatalogEntry | undefined): string {
	if (!entry || entry.status === 'idle') return 'Not checked yet.'
	if (entry.status === 'loading') return 'Checking…'
	if (entry.status === 'error') return 'Unreachable'
	return 'No tools.'
}
