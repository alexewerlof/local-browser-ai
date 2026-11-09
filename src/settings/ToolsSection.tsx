import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import type { AppSettings, McpServerSettings } from '../core/types'
import { createId } from '../core/util'
import { mcpServerKey } from '../core/mcp'
import { syncOriginStripping } from '../platform/net-rules'
import { updateSettings } from '../state/settings'
import { mcpCatalogStore, refreshMcpServer, refreshMcpServers } from '../state/mcp'
import { useStore } from '../app/useStore'
import { BuiltInToolsCard } from './BuiltInToolsCard'
import { McpServerCard } from './McpServerCard'
import { McpServerEditor } from './McpServerEditor'
import { SettingsCard } from './SettingsCard'

/**
 * Settings → Tools: the built-in tool set first, then one card per MCP server, all with the
 * same controls. Built-ins and servers are two kinds of the same thing here — a tool set the
 * user can switch off wholesale or tool by tool — so they share rows, checkboxes and the
 * composer's tree.
 */
export function ToolsSection({ settings }: { settings: AppSettings }) {
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
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [signature])

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

	/** Switching a checkbox on a saved server: same write without the "form closed" step. */
	const replaceServer = (server: McpServerSettings) =>
		updateSettings((current) => ({
			...current,
			tools: {
				...current.tools,
				mcp: current.tools.mcp.map((entry) => (entry.id === server.id ? server : entry)),
			},
		}))

	const cancelEdit = () => {
		setEditing(null)
		// A test may have applied rules for an unsaved draft; put back the saved set.
		void syncOriginStripping(servers)
	}

	const removeServer = (id: string) =>
		updateSettings((current) => ({
			...current,
			tools: {
				...current.tools,
				mcp: current.tools.mcp.filter((entry) => entry.id !== id),
			},
		}))

	const addServer = () => {
		setEditing({
			id: createId('mcp'),
			label: 'MCP server',
			url: '',
			headers: {},
			enabled: true,
			autoApprove: false,
			autoApproveTools: [],
			disabledTools: [],
			stripOrigin: false,
		})
		setIsNew(true)
	}

	return (
		<div className="section">
			<BuiltInToolsCard settings={settings} />

			{servers.map((server) =>
				editing?.id === server.id ? (
					<SettingsCard key={server.id}>
						<McpServerEditor
							server={editing}
							servers={servers}
							isNew={false}
							onSave={saveServer}
							onCancel={cancelEdit}
						/>
					</SettingsCard>
				) : (
					<McpServerCard
						key={server.id}
						server={server}
						entry={catalog[mcpServerKey(server)]}
						onChange={replaceServer}
						onEdit={() => {
							setEditing({ ...server, headers: { ...server.headers } })
							setIsNew(false)
						}}
						onRefresh={() => void refreshMcpServer(server)}
						onRemove={() => removeServer(server.id)}
					/>
				),
			)}

			{editing && isNew && (
				<SettingsCard>
					<McpServerEditor
						server={editing}
						servers={servers}
						isNew
						onSave={saveServer}
						onCancel={cancelEdit}
					/>
				</SettingsCard>
			)}

			{!editing && (
				<div className="section__action">
					<button type="button" className="button" onClick={addServer}>
						<Plus size={18} />
						Add MCP server
					</button>
				</div>
			)}
		</div>
	)
}
