import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import type { AppSettings, McpServerSettings } from '../core/types'
import { createId } from '../core/util'
import { formatHeaderLines, isHttpUrl, mcpServerKey, parseHeaderLines } from '../core/mcp'
import { hostOf, requestHostAccess } from '../platform/permissions'
import { syncOriginStripping } from '../platform/net-rules'
import { updateSettings } from '../state/settings'
import { mcpCatalogEntry, mcpCatalogStore, refreshMcpServer, refreshMcpServers } from '../state/mcp'
import { useStore } from '../app/useStore'
import { Switch, TextAreaField, TextField } from './fields'
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

	return (
		<>
			<SettingsCard title="MCP servers">
				{servers.length === 0 ? (
					<p className="section__intro">
						No MCP servers yet. Add an HTTP endpoint to expose its tools to the model.
					</p>
				) : (
					<div className="rows">
						{servers.map((server) => (
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
													patchServer(server.id, (current) => ({ ...current, autoApprove }))
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
													mcp: current.tools.mcp.filter((entry) => entry.id !== server.id),
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
						))}
					</div>
				)}
			</SettingsCard>

			{editing ? (
				<McpServerEditor
					key={editing.id}
					server={editing}
					servers={servers}
					isNew={isNew}
					onCancel={() => {
						setEditing(null)
						// A test may have applied rules for an unsaved draft; put back the saved set.
						void syncOriginStripping(servers)
					}}
					onSave={(server) => {
						updateSettings((current) => {
							const exists = current.tools.mcp.some((entry) => entry.id === server.id)
							const mcp = exists
								? current.tools.mcp.map((entry) => (entry.id === server.id ? server : entry))
								: [...current.tools.mcp, server]
							return { ...current, tools: { ...current.tools, mcp } }
						})
						setEditing(null)
					}}
				/>
			) : (
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

/** The settings list with one server replaced or appended, for a rule rebuild. */
function withCandidate(servers: McpServerSettings[], candidate: McpServerSettings): McpServerSettings[] {
	const exists = servers.some((server) => server.id === candidate.id)
	return exists ? servers.map((server) => (server.id === candidate.id ? candidate : server)) : [...servers, candidate]
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

function McpServerEditor({
	server,
	servers,
	isNew,
	onSave,
	onCancel,
}: {
	server: McpServerSettings
	/** Every configured server, so a test can rebuild the whole rule set. */
	servers: McpServerSettings[]
	isNew: boolean
	onSave: (server: McpServerSettings) => void
	onCancel: () => void
}) {
	const [draft, setDraft] = useState<McpServerSettings>(server)
	const [headersText, setHeadersText] = useState(formatHeaderLines(server.headers))
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
	/** Set when the server answered 403, so the fix can be offered as one click. */
	const [offerStripOrigin, setOfferStripOrigin] = useState(false)

	const patch = (update: Partial<McpServerSettings>) => setDraft((current) => ({ ...current, ...update }))

	const draftWithHeaders = (): { server: McpServerSettings; error?: string } => {
		const { headers, errors } = parseHeaderLines(headersText)
		if (errors.length > 0) return { server: draft, error: errors.join(' ') }
		return {
			server: { ...draft, label: draft.label.trim() || 'MCP server', url: draft.url.trim(), headers },
		}
	}

	const test = async () => {
		const parsed = draftWithHeaders()
		if (parsed.error) {
			setMessage({ ok: false, text: parsed.error })
			return
		}
		if (!isHttpUrl(parsed.server.url)) {
			setMessage({ ok: false, text: 'Enter an http:// or https:// URL.' })
			return
		}

		setBusy(true)
		setMessage(null)
		setOfferStripOrigin(false)
		try {
			// Must be the first await of the click: Chrome only prompts while the gesture is live.
			if (!(await requestHostAccess(parsed.server.url))) {
				setMessage({ ok: false, text: `Chrome did not grant access to ${hostOf(parsed.server.url)}.` })
				return
			}
			await runTest(parsed.server)
		} finally {
			setBusy(false)
		}
	}

	/** Connect once and turn the result into a notice; shared by Test and the retry. */
	const runTest = async (candidate: McpServerSettings) => {
		// The rule that drops `Origin` lives in the browser, not in settings, so it has
		// to be in place before the request rather than after a save.
		const rulesApplied = await syncOriginStripping(withCandidate(servers, candidate))

		const entry = await refreshMcpServer(candidate)
		if (entry.status === 'ready') {
			setMessage({ ok: true, text: `Connected. ${entry.tools.length} tools available.` })
			return
		}

		let text = entry.error ?? 'The server could not be reached.'
		if (candidate.stripOrigin && !rulesApplied) {
			// Never leave a switch that looks applied but cannot do anything.
			text += ' This build cannot change request headers, so the Origin header is still being sent.'
		}
		setMessage({ ok: false, text })
		setOfferStripOrigin(!candidate.stripOrigin && /HTTP 403/.test(entry.error ?? ''))
	}

	const save = async () => {
		const parsed = draftWithHeaders()
		if (parsed.error) {
			setMessage({ ok: false, text: parsed.error })
			return
		}
		if (!isHttpUrl(parsed.server.url)) {
			setMessage({ ok: false, text: 'Enter an http:// or https:// URL.' })
			return
		}

		// Saving is the user asking to use this endpoint, so ask now while the gesture is live.
		if (!(await requestHostAccess(parsed.server.url))) {
			setMessage({ ok: false, text: `Chrome did not grant access to ${hostOf(parsed.server.url)}.` })
			return
		}

		onSave(parsed.server)
	}

	return (
		<SettingsCard title={isNew ? 'Add an MCP server' : `Edit ${draft.label}`}>
			<TextField
				label="Name"
				value={draft.label}
				onChange={(label) => patch({ label })}
				placeholder="Local MCP server"
			/>
			<TextField
				label="URL"
				value={draft.url}
				onChange={(url) => patch({ url })}
				placeholder="http://127.0.0.1:9000/mcp"
				hint="Streamable HTTP endpoint. stdio servers are not supported in the browser."
			/>
			<TextAreaField
				label="Headers"
				value={headersText}
				onChange={setHeadersText}
				rows={3}
				placeholder="Authorization: Bearer …"
				hint="One “Name: value” pair per line. Stored locally and sent only to this server."
			/>

			<div className="tool-option">
				<Switch
					label="Send requests without an Origin header"
					checked={draft.stripOrigin}
					onChange={(stripOrigin) => patch({ stripOrigin })}
				/>
				<span>Send requests without an Origin header</span>
			</div>
			<div className="hint">
				Many MCP servers reject browser requests based on the Origin they send. Turn this on for a server that
				answers 403 however correct the headers are.
			</div>

			{message && (
				<div className={`notice ${message.ok ? 'notice--good' : 'notice--bad'}`}>
					{message.text}
					{offerStripOrigin && (
						<div className="row" style={{ gap: 'var(--space-3)' }}>
							<button
								type="button"
								className="button button--sm"
								disabled={busy}
								onClick={() => {
									const candidate = { ...draftWithHeaders().server, stripOrigin: true }
									setDraft(candidate)
									setOfferStripOrigin(false)
									setBusy(true)
									void runTest(candidate).finally(() => setBusy(false))
								}}
							>
								Retry without the Origin header
							</button>
						</div>
					)}
				</div>
			)}

			<div className="row" style={{ gap: 'var(--space-3)' }}>
				<button type="button" className="button button--primary" onClick={() => void save()}>
					{isNew ? 'Add server' : 'Save server'}
				</button>
				<button type="button" className="button button--sm" onClick={() => void test()} disabled={busy}>
					{busy ? 'Connecting…' : 'Test connection'}
				</button>
				<button type="button" className="button button--ghost" onClick={onCancel}>
					Cancel
				</button>
			</div>
		</SettingsCard>
	)
}
