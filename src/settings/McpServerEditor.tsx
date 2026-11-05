import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { McpServerSettings } from '../core/types'
import { createId } from '../core/util'
import { headersToRows, isHttpUrl, rowsToHeaders } from '../core/mcp'
import { hostOf, requestHostAccess } from '../platform/permissions'
import { syncOriginStripping } from '../platform/net-rules'
import { refreshMcpServer } from '../state/mcp'
import { SwitchField, TextField } from './fields'

/** A header pair plus a stable id, so removing a row cannot shuffle the others. */
interface EditableHeader {
	id: string
	name: string
	value: string
}

const blankHeader = (): EditableHeader => ({ id: createId('header'), name: '', value: '' })

/** The saved header map as rows; an empty map still shows one row to fill in. */
function initialHeaders(server: McpServerSettings): EditableHeader[] {
	const rows = headersToRows(server.headers).map((row) => ({ ...row, id: createId('header') }))
	return rows.length > 0 ? rows : [blankHeader()]
}

/**
 * The MCP server form. It renders where the server's row was, inside the
 * "MCP servers" card, so the list and the editor are never two separate panels.
 */
export function McpServerEditor({
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
	const [headers, setHeaders] = useState<EditableHeader[]>(() => initialHeaders(server))
	const [headerErrors, setHeaderErrors] = useState<Array<string | undefined>>([])
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
	/** Set when the server answered 403, so the fix can be offered as one click. */
	const [offerStripOrigin, setOfferStripOrigin] = useState(false)

	const headersRef = useRef<HTMLDivElement>(null)
	/** Row to focus after the next render (a row the user just added). */
	const pendingFocus = useRef<string | null>(null)

	useEffect(() => {
		const id = pendingFocus.current
		if (!id) return
		pendingFocus.current = null
		headersRef.current?.querySelector<HTMLInputElement>(`input[data-header-row="${id}"]`)?.focus()
	})

	const patch = (update: Partial<McpServerSettings>) => setDraft((current) => ({ ...current, ...update }))

	const patchHeader = (id: string, update: Partial<EditableHeader>) => {
		setHeaders((current) => current.map((row) => (row.id === id ? { ...row, ...update } : row)))
		const index = headers.findIndex((row) => row.id === id)
		// The row changed, so its old complaint no longer describes it.
		if (index >= 0) setHeaderErrors((current) => current.map((error, at) => (at === index ? undefined : error)))
	}

	const addHeader = () => {
		const row = blankHeader()
		pendingFocus.current = row.id
		setHeaders((current) => [...current, row])
	}

	const removeHeader = (id: string) => {
		const index = headers.findIndex((row) => row.id === id)
		setHeaders((current) => current.filter((row) => row.id !== id))
		setHeaderErrors((current) => current.filter((_, at) => at !== index))
	}

	const draftWithHeaders = (): { server: McpServerSettings; error?: string } => {
		const parsed = rowsToHeaders(headers)
		setHeaderErrors(parsed.errors)
		if (parsed.errors.some(Boolean)) return { server: draft, error: 'Fix the highlighted headers.' }
		return {
			server: {
				...draft,
				label: draft.label.trim() || 'MCP server',
				url: draft.url.trim(),
				headers: parsed.headers,
			},
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

	const headersLabelId = `${server.id}-headers`

	return (
		<div className="mcp-editor">
			<div className="mcp-editor__head">{isNew ? 'Add an MCP server' : `Edit ${server.label}`}</div>

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

			<div className="field field--stacked">
				<span className="field__text" id={headersLabelId}>
					<span className="field__label">Headers</span>
					<span className="field__hint">Sent only to this server, and stored in this browser profile.</span>
				</span>
				<div className="mcp-headers" role="group" aria-labelledby={headersLabelId} ref={headersRef}>
					{headers.map((row, index) => {
						const error = headerErrors[index]
						const errorId = `${row.id}-error`
						return (
							<div className="mcp-header" key={row.id}>
								<input
									className="input"
									value={row.name}
									placeholder="Name"
									aria-label={`Header ${index + 1} name`}
									aria-invalid={error ? true : undefined}
									aria-describedby={error ? errorId : undefined}
									data-header-row={row.id}
									onChange={(event) => patchHeader(row.id, { name: event.target.value })}
									spellCheck={false}
									autoComplete="off"
								/>
								<input
									className="input"
									value={row.value}
									placeholder="Value"
									aria-label={`Header ${index + 1} value`}
									aria-invalid={error ? true : undefined}
									aria-describedby={error ? errorId : undefined}
									onChange={(event) => patchHeader(row.id, { value: event.target.value })}
									spellCheck={false}
									autoComplete="off"
								/>
								<button
									type="button"
									className="button button--ghost button--icon button--sm"
									title={`Remove header ${index + 1}`}
									aria-label={`Remove header ${index + 1}`}
									onClick={() => removeHeader(row.id)}
								>
									<Trash2 size={13} />
								</button>
								{error && (
									<span className="mcp-header__error" id={errorId}>
										{error}
									</span>
								)}
							</div>
						)
					})}
					<button type="button" className="button button--sm" onClick={addHeader}>
						<Plus size={16} />
						Add header
					</button>
				</div>
			</div>

			<SwitchField
				label="Send requests without an Origin header"
				hint="Many MCP servers reject browser requests based on the Origin header they send. Turn this on for a server that answers 403 however correct the headers are."
				checked={draft.stripOrigin}
				onChange={(stripOrigin) => patch({ stripOrigin })}
			/>

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
		</div>
	)
}

/** The settings list with one server replaced or appended, for a rule rebuild. */
export function withCandidate(servers: McpServerSettings[], candidate: McpServerSettings): McpServerSettings[] {
	const exists = servers.some((server) => server.id === candidate.id)
	return exists ? servers.map((server) => (server.id === candidate.id ? candidate : server)) : [...servers, candidate]
}
