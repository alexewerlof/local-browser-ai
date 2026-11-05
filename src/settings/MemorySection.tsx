import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, MemoryStick, Pencil, Plus, RotateCcw, Trash2, Upload } from 'lucide-react'
import type { AppSettings, MemoryItem, MemoryMode } from '../core/types'
import { liveMemories, MEMORY_MAX_TEXT, memoryOneLine, parseMemoryExport } from '../core/memory'
import { estimateTokens } from '../core/context/tokens'
import { formatTokens, relativeTime } from '../core/util'
import {
	deleteMemory,
	exportMemoryDocument,
	importMemoryItems,
	memoryStatusStore,
	memoryStore,
	restoreMemory,
	saveMemory,
	setMemoryMode,
	updateMemory,
} from '../state/memory'
import { updateSettings } from '../state/settings'
import { useStore } from '../app/useStore'
import { RangeField, SelectField, Switch, TextAreaField, TextField } from './fields'
import { SettingsCard } from './SettingsCard'

const MODE_OPTIONS: Array<{ value: MemoryMode; label: string }> = [
	{ value: 'always', label: 'Always — every message' },
	{ value: 'auto', label: 'Auto — when the message matches' },
	{ value: 'tool', label: 'Tool only — when the model asks' },
]

/** The row select is narrow, so it uses the short form; the full wording lives in the editor. */
const MODE_SHORT_OPTIONS: Array<{ value: MemoryMode; label: string }> = [
	{ value: 'always', label: 'Always' },
	{ value: 'auto', label: 'Auto' },
	{ value: 'tool', label: 'Tool only' },
]

const MODE_BADGES: Record<MemoryMode, string> = {
	always: 'always',
	auto: 'auto',
	tool: 'tool only',
}

interface EditorTarget {
	kind: 'new' | 'edit'
	id?: string
}

export function MemorySection({ settings }: { settings: AppSettings }) {
	const status = useStore(memoryStatusStore)
	const memoryDocument = useStore(memoryStore)
	const [filter, setFilter] = useState('')
	const [editor, setEditor] = useState<EditorTarget | null>(null)
	const [undo, setUndo] = useState<{ id: string; title: string } | null>(null)
	const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
	const fileRef = useRef<HTMLInputElement>(null)

	const live = useMemo(() => liveMemories(memoryDocument.items), [memoryDocument.items])
	const tokens = useMemo(
		() => live.reduce((total, item) => total + estimateTokens(`${item.title}\n${item.text}`), 0),
		[live],
	)
	const visible = useMemo(() => {
		const needle = filter.trim().toLowerCase()
		if (!needle) return live
		return live.filter((item) => `${item.title}\n${item.text}`.toLowerCase().includes(needle))
	}, [live, filter])

	// The undo affordance is a notice, not a dialog: it disappears on its own.
	useEffect(() => {
		if (!undo) return
		const timer = setTimeout(() => setUndo(null), 8000)
		return () => clearTimeout(timer)
	}, [undo])

	const setPolicy = (patch: Partial<AppSettings['memory']>) =>
		updateSettings((current) => ({ ...current, memory: { ...current.memory, ...patch } }))

	const remove = async (item: MemoryItem) => {
		const removed = await deleteMemory(item.id)
		if (removed) setUndo({ id: item.id, title: memoryOneLine(item.title || item.text).slice(0, 60) })
		else setNotice({ ok: false, text: 'That memory could not be deleted.' })
	}

	const onExport = () => {
		const exported = exportMemoryDocument()
		if (live.length === 0) {
			setNotice({ ok: false, text: 'There is nothing to export yet.' })
			return
		}
		const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = `local-browser-ai-memory-${new Date(exported.exportedAt).toISOString().slice(0, 10)}.json`
		anchor.click()
		// Revoking straight away can cancel the download in some builds.
		setTimeout(() => URL.revokeObjectURL(url), 1000)
		setNotice({ ok: true, text: `Exported ${live.length} memories.` })
	}

	const onImportFile = async (file: File | undefined) => {
		if (!file) return
		setNotice(null)
		try {
			const parsed = parseMemoryExport(JSON.parse(await file.text()) as unknown)
			if (!parsed) {
				setNotice({ ok: false, text: 'That file is not a memory export.' })
				return
			}
			const report = await importMemoryItems(parsed)
			setNotice(
				report.ok
					? {
							ok: true,
							text: `Imported: ${report.added} added, ${report.updated} updated, ${report.skipped} skipped.`,
						}
					: { ok: false, text: 'The import could not be written to storage.' },
			)
		} catch {
			setNotice({ ok: false, text: 'That file is not valid JSON.' })
		} finally {
			if (fileRef.current) fileRef.current.value = ''
		}
	}

	const editing = editor?.kind === 'edit' ? live.find((item) => item.id === editor.id) : undefined
	const editorOpen = editor !== null && (editor.kind === 'new' || editing !== undefined)

	return (
		<div className="section">
			<p className="section__intro">
				Memory is a flat list of notes that survive across chats. An always-on memory is injected into every
				turn, an auto memory only when your message matches it, and a tool-only memory sits in storage until the
				model searches for it. Memories are stored in this browser profile; use export to move them to another
				machine.
			</p>

			<SettingsCard title="Memory settings">
				<div className="field">
					<span className="field__text">
						<span className="field__label">Enable memory</span>
						<span className="field__hint">
							Injects memories into the prompt and gives the model the remember and recall tools.
						</span>
					</span>
					<Switch
						label="Enable memory"
						checked={settings.memory.enabled}
						onChange={(enabled) => setPolicy({ enabled })}
					/>
				</div>
				<RangeField
					label="Memory budget"
					min={0.05}
					max={0.4}
					step={0.05}
					value={settings.memory.injectShare}
					format={(value) => `${Math.round(value * 100)}%`}
					onChange={(injectShare) => setPolicy({ injectShare })}
					hint="The largest share of the usable context window the injected memories may occupy."
				/>
				<RangeField
					label="Auto memories per message"
					min={1}
					max={8}
					step={1}
					value={settings.memory.autoLimit}
					format={(value) => `${value}`}
					onChange={(autoLimit) => setPolicy({ autoLimit })}
					hint="How many matching auto memories may be injected at once."
				/>
				<div className="field">
					<span className="field__text">
						<span className="field__label">Stored</span>
						<span className="field__hint">
							{live.length} {live.length === 1 ? 'memory' : 'memories'}, about {formatTokens(tokens)}{' '}
							tokens in total.
						</span>
					</span>
				</div>
			</SettingsCard>

			{!settings.memory.enabled && (
				<div className="notice">
					Memory is off: nothing is injected and the model gets neither the remember nor the recall tool. Your
					memories are kept.
				</div>
			)}

			<SettingsCard title="Memories">
				{status !== 'ready' ? (
					<p className="section__intro">Loading memories…</p>
				) : live.length === 0 ? (
					<div className="memory-empty">
						<MemoryStick size={20} />
						<p>
							Nothing saved yet. The model saves memories with the remember tool, and you can add one
							below.
						</p>
					</div>
				) : (
					<>
						<div className="memory-filter">
							<input
								className="input"
								type="search"
								value={filter}
								placeholder="Filter memories"
								aria-label="Filter memories"
								onChange={(event) => setFilter(event.target.value)}
							/>
						</div>
						<div className="rows">
							{visible.map((item) => (
								<div key={item.id} className="row-item">
									<div className="row-item__text">
										<span className="row-item__title">
											{item.title || memoryOneLine(item.text).slice(0, 60)}
											<span className="badge badge--memory">{MODE_BADGES[item.mode]}</span>
											{item.source && <span className="badge">from chat</span>}
										</span>
										<span className="row-item__desc memory-preview">
											{memoryOneLine(item.text)}
										</span>
										<span className="row-item__desc">Updated {relativeTime(item.updatedAt)}</span>
									</div>
									<div className="memory-row__actions">
										<select
											className="select memory-row__mode"
											value={item.mode}
											aria-label={`Mode for ${item.title || memoryOneLine(item.text).slice(0, 40)}`}
											onChange={(event) =>
												void setMemoryMode(item.id, event.target.value as MemoryMode)
											}
										>
											{MODE_SHORT_OPTIONS.map((option) => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</select>
										<button
											type="button"
											className="button button--ghost button--icon button--sm"
											title="Edit memory"
											aria-label="Edit memory"
											onClick={() => setEditor({ kind: 'edit', id: item.id })}
										>
											<Pencil size={13} />
										</button>
										<button
											type="button"
											className="button button--ghost button--icon button--sm"
											title="Delete memory"
											aria-label="Delete memory"
											onClick={() => void remove(item)}
										>
											<Trash2 size={13} />
										</button>
									</div>
								</div>
							))}
							{visible.length === 0 && <p className="section__intro">No memory matches that filter.</p>}
						</div>
					</>
				)}
			</SettingsCard>

			{undo && (
				<div className="notice notice--undo">
					<span>Deleted “{undo.title}”.</span>
					<span className="spacer" />
					<button
						type="button"
						className="button button--sm"
						onClick={() => {
							void restoreMemory(undo.id)
							setUndo(null)
						}}
					>
						<RotateCcw size={13} />
						Undo
					</button>
				</div>
			)}

			{editorOpen ? (
				<MemoryEditor
					key={editor?.kind === 'edit' ? editor.id : 'new'}
					initial={
						editing
							? { title: editing.title, text: editing.text, mode: editing.mode }
							: { title: '', text: '', mode: 'auto' }
					}
					isNew={editor?.kind === 'new'}
					onCancel={() => setEditor(null)}
					onSave={async (values) => {
						if (editing) {
							const written = await updateMemory(editing.id, values)
							if (!written) return 'That memory could not be saved.'
							setEditor(null)
							return null
						}
						const result = await saveMemory(values)
						if (!result.ok) return result.error
						setEditor(null)
						return null
					}}
				/>
			) : (
				<div className="section__action">
					<button type="button" className="button" onClick={() => setEditor({ kind: 'new' })}>
						<Plus size={18} />
						Add memory
					</button>
				</div>
			)}

			<SettingsCard title="Export and import">
				<p className="section__intro">
					Export writes every memory, including deletions, to a JSON file. Import merges by id and keeps the
					newest version of each memory, so importing an older file never resurrects something you deleted.
				</p>
				<div className="row" style={{ gap: 'var(--space-3)' }}>
					<button type="button" className="button" onClick={onExport}>
						<Download size={16} />
						Export memories
					</button>
					<button type="button" className="button" onClick={() => fileRef.current?.click()}>
						<Upload size={16} />
						Import memories
					</button>
					<input
						ref={fileRef}
						type="file"
						accept="application/json,.json"
						hidden
						aria-label="Import a memory export"
						onChange={(event) => void onImportFile(event.target.files?.[0])}
					/>
				</div>
				{notice && <div className={`notice ${notice.ok ? 'notice--good' : 'notice--bad'}`}>{notice.text}</div>}
			</SettingsCard>
		</div>
	)
}

interface DraftValues {
	title: string
	text: string
	mode: MemoryMode
}

function MemoryEditor({
	initial,
	isNew,
	onSave,
	onCancel,
}: {
	initial: DraftValues
	isNew: boolean
	onSave: (values: DraftValues) => Promise<string | null>
	onCancel: () => void
}) {
	const [title, setTitle] = useState(initial.title)
	const [text, setText] = useState(initial.text)
	const [mode, setMode] = useState<MemoryMode>(initial.mode)
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	const save = async () => {
		if (!text.trim()) {
			setError('A memory needs some text.')
			return
		}
		setBusy(true)
		setError(null)
		const message = await onSave({ title: title.trim(), text: text.trim(), mode })
		setBusy(false)
		if (message) setError(message)
	}

	return (
		<SettingsCard title={isNew ? 'New memory' : 'Edit memory'}>
			<TextField
				label="Title"
				value={title}
				onChange={setTitle}
				placeholder="Optional short label"
				hint="Used as the bullet label and in this list. Leave it empty to use the first line."
			/>
			<TextAreaField
				label="Memory"
				value={text}
				rows={4}
				onChange={setText}
				hint={`${text.length} / ${MEMORY_MAX_TEXT} characters. One fact per memory works best.`}
				placeholder="Prefers TypeScript with tabs and no semicolons."
			/>
			<SelectField
				label="When to use it"
				value={mode}
				options={MODE_OPTIONS}
				onChange={setMode}
				hint="Always-on memories are set here, by you. The model itself can only save auto and tool-only memories."
			/>
			{error && <div className="notice notice--bad">{error}</div>}
			<div className="row" style={{ gap: 'var(--space-3)' }}>
				<button type="button" className="button button--primary" disabled={busy} onClick={() => void save()}>
					{isNew ? 'Add memory' : 'Save memory'}
				</button>
				<button type="button" className="button button--ghost" onClick={onCancel}>
					Cancel
				</button>
			</div>
		</SettingsCard>
	)
}
