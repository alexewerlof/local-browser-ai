import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import type { AppSettings, McpServerSettings } from '../core/types'
import { createId } from '../core/util'
import { mcpServerKey } from '../core/mcp'
import { syncOriginStripping } from '../platform/net-rules'
import { updateSettings } from '../state/settings'
import { mcpCatalogStore, refreshMcpServer, refreshMcpServers } from '../state/mcp'
import { useStore } from '../app/useStore'
import { Switch } from './fields'
import { McpServerEditor } from './McpServerEditor'
import { SettingsCard } from './SettingsCard'

export function McpServersCard({ settings }: { settings: AppSettings }) {
	const catalog = useStore(mcpCatalogStore)
	const [editing, setEditing] = useState<McpServerSettings | null>(null)
	const [isNew, setIsNew] = useState(false)

	const servers = settings.tools.mcp
	// Editing a URL or a header set must re-check that server; enabling one should too.
	const signature = servers.map((server) => `${mcpServerKey(server)}:${server.enabled}`).join('|')

	useEffect(() => {
		if (servers.length === 0) return
		void refreshMcpServers(servers)
		// Only re-check when a server is added, edited or removed; `signature` is that set.
	}, [signature])

	const patchServer = (id: string, update: (server: McpServerSettings) => McpServerSettings) =>
		updateSettings((current) => ({
			...current,
			tools: {
				...current.tools,
				mcp: current.tools.mcp.map((server) => (server.id === id ? update(server) : server)),
			},
		}))

	const toggleTool = (server: McpServerSettings, toolName: string, enabled: boolean) =>
		patchServer(server.id, (current) => {
			const disabled = new Set(current.disabledTools)
			if (enabled) disabled.delete(toolName)
			else disabled.add(toolName)
			return { ...current, disabledTools: [...disabled] }
		})

	const saveServer = (server: McpServerSettings) => {
		updateSettings((current) => {
			const exists = current.tools.mcp.some((entry) => entry.id === server.id)
			const mcp = exists
				? current.tools.mcp.map((entry) => (entry.id === server.id ? server : entry))
				: [...current.tools.mcp, server]
			return { ...current, tools: { ...current.tools, mcp } }
		})
		setEditing(null)
	}

	const cancelEdit = () => {
		setEditing(null)
		// A test may have applied rules for an unsaved draft; put back the saved set.
		void syncOriginStripping(servers)
	}

	return (
		<>
			<SettingsCard title="MCP servers">
				{servers.length === 0 && !editing?.id ? (
					<p className="section__intro">
						No MCP servers yet. Add an HTTP endpoint to expose its tools to the model.
					</p>
				) : (
					<div className="rows">
						{servers.map((server) =>
							editing?.id === server.id ? (
								<McpServerEditor
									key={editing.id}
									server={editing}
									servers={servers}
									isNew={false}
									onSave={saveServer}
									onCancel={cancelEdit}
								/>
							) : (
								<div key={server.id} className="mcp-server">
									<div className="provider">
										<div className="provider__main">
											<span className="provider__label">
												{server.label}
												<span className="badge">http</span>
												{server.stripOrigin && <span className="badge">no Origin</span>}
												<StatusBadge
													status={catalog[mcpServerKey(server)]?.status ?? 'idle'}
													tools={catalog[mcpServerKey(server)]?.tools.length ?? 0}
												/>
											</span>
											<span className="provider__meta">{server.url}</span>
											<div className="tool-option">
												<Switch
													label={`Run MCP tools from ${server.label} without asking`}
													checked={server.autoApprove}
													disabled={!server.enabled}
													onChange={(autoApprove) =>
														patchServer(server.id, (current) => ({
															...current,
															autoApprove,
														}))
													}
												/>
												<span>Run without asking</span>
											</div>
										</div>
										<button
											type="button"
											className="button button--sm"
											onClick={() => void refreshMcpServer(server)}
										>
											Refresh
										</button>
										<button
											type="button"
											className="button button--sm"
											onClick={() => {
												setEditing({ ...server, headers: { ...server.headers } })
												setIsNew(false)
											}}
										>
											Edit
										</button>
										<button
											type="button"
											className="button button--danger button--sm"
											onClick={() =>
												updateSettings((current) => ({
													...current,
													tools: {
														...current.tools,
														mcp: current.tools.mcp.filter(
															(entry) => entry.id !== server.id,
														),
													},
												}))
											}
										>
											Remove
										</button>
										<Switch
											label={`Enable ${server.label}`}
											checked={server.enabled}
											onChange={(enabled) =>
												patchServer(server.id, (current) => ({ ...current, enabled }))
											}
										/>
									</div>

									{catalog[mcpServerKey(server)]?.error && (
										<div className="notice notice--bad">{catalog[mcpServerKey(server)]?.error}</div>
									)}

									<McpToolList
										server={server}
										tools={catalog[mcpServerKey(server)]?.tools ?? []}
										onToggle={(name, enabled) => toggleTool(server, name, enabled)}
									/>
								</div>
							),
						)}
						{editing && isNew && (
							<McpServerEditor
								key={editing.id}
								server={editing}
								servers={servers}
								isNew
								onSave={saveServer}
								onCancel={cancelEdit}
							/>
						)}
					</div>
				)}
			</SettingsCard>

			{!editing && (
				<div className="section__action">
					<button
						type="button"
						className="button"
						onClick={() => {
							setEditing({
								id: createId('mcp'),
								label: 'MCP server',
								url: '',
								headers: {},
								enabled: true,
								autoApprove: false,
								disabledTools: [],
								stripOrigin: false,
							})
							setIsNew(true)
						}}
					>
						<Plus size={18} />
						Add MCP server
					</button>
				</div>
			)}
		</>
	)
}

function StatusBadge({ status, tools }: { status: 'idle' | 'loading' | 'ready' | 'error'; tools: number }) {
	if (status === 'loading') return <span className="badge">checking…</span>
	if (status === 'ready') return <span className="badge badge--accent">{tools} tools</span>
	if (status === 'error') return <span className="badge badge--danger">unreachable</span>
	return <span className="badge">not checked</span>
}

function McpToolList({
	server,
	tools,
	onToggle,
}: {
	server: McpServerSettings
	tools: Array<{ name: string; title?: string; description?: string; readOnly: boolean }>
	onToggle: (name: string, enabled: boolean) => void
}) {
	if (tools.length === 0) return null

	return (
		<div className="mcp-tools">
			{tools.map((tool) => (
				<div key={tool.name} className="mcp-tool">
					<div className="row-item__text">
						<span className="row-item__title">
							{tool.title || tool.name}
							<span className="badge">{tool.name}</span>
							{tool.readOnly && <span className="badge">read-only</span>}
						</span>
						{tool.description && <span className="row-item__desc">{tool.description}</span>}
					</div>
					<Switch
						label={`Enable ${tool.name} on ${server.label}`}
						checked={!server.disabledTools.includes(tool.name)}
						disabled={!server.enabled}
						onChange={(enabled) => onToggle(tool.name, enabled)}
					/>
				</div>
			))}
		</div>
	)
}
