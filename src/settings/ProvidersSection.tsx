import { useState } from 'react'
import { CircleAlert, CircleCheck, Plus, RefreshCw } from 'lucide-react'
import type { AppSettings, ModelDetails, ProviderSettings, ProviderKind } from '../core/types'
import { createId } from '../core/util'
import { PROVIDER_PRESETS, type ProviderPreset } from '../providers/types'
import { DEFAULT_BASE_URLS } from '../providers/registry'
import { discoverModels } from '../providers/discovery'
import { toAppError } from '../providers/errors'
import { hasHostAccess, hostOf, requestHostAccess } from '../platform/permissions'
import { updateSettings } from '../state/settings'
import { Field, SelectField, TextField } from './fields'
import { ProviderModelTable } from './ProviderModelTable'
import { SettingsCard } from './SettingsCard'

/** One row per id; a later duplicate replaces the earlier entry. */
function dedupeDetails(details: ModelDetails[]): ModelDetails[] {
	const byId = new Map<string, ModelDetails>()
	for (const detail of details) byId.set(detail.id, detail)
	return [...byId.values()]
}

export function ProvidersSection({ settings }: { settings: AppSettings }) {
	const [editing, setEditing] = useState<ProviderSettings | null>(null)
	const [isNew, setIsNew] = useState(false)
	const [presetsOpen, setPresetsOpen] = useState(false)

	const startNew = (preset: ProviderPreset) => {
		setEditing({
			id: createId('prov'),
			kind: preset.kind,
			label: preset.label,
			baseURL: preset.kind === 'prompt-api' ? undefined : preset.defaultBaseURL,
			apiKey: '',
			models: preset.kind === 'prompt-api' ? ['text'] : [],
		})
		setIsNew(true)
		setPresetsOpen(false)
	}

	return (
		<div className="section">
			<p className="section__intro">
				Providers are model endpoints. The built-in browser model needs no account. Local servers run on your
				machine or network; hosted APIs need a key. Everything is stored in this browser profile.
			</p>

			<SettingsCard title="Configured providers">
				<div className="rows">
					{settings.providers.map((provider) => (
						<div key={provider.id} className="provider">
							<div className="provider__main">
								<span className="provider__label">
									{provider.label}
									<span className="badge">{provider.kind}</span>
									{settings.defaultModel?.providerId === provider.id && (
										<span className="badge badge--accent">default</span>
									)}
								</span>
								<span className="provider__meta">
									{provider.kind === 'prompt-api'
										? 'On-device model managed by the browser'
										: `${provider.baseURL ?? '—'} · ${provider.models.length} models`}
								</span>
							</div>
							<button
								type="button"
								className="button button--sm"
								onClick={() => {
									setEditing({
										...provider,
										models: [...provider.models],
										modelDetails: provider.modelDetails?.map((model) => ({ ...model })),
										modelThinking: provider.modelThinking
											? { ...provider.modelThinking }
											: undefined,
									})
									setIsNew(false)
								}}
							>
								Edit
							</button>
							{provider.kind !== 'prompt-api' && (
								<button
									type="button"
									className="button button--danger button--sm"
									onClick={() => {
										updateSettings((current) => {
											const providers = current.providers.filter(
												(entry) => entry.id !== provider.id,
											)
											const defaultModel =
												current.defaultModel?.providerId === provider.id
													? providers[0]?.models[0]
														? {
																providerId: providers[0].id,
																modelId: providers[0].models[0],
															}
														: null
													: current.defaultModel
											return { ...current, providers, defaultModel }
										})
									}}
								>
									Remove
								</button>
							)}
						</div>
					))}
				</div>
			</SettingsCard>

			{presetsOpen ? (
				<SettingsCard title="Add a provider">
					<div className="preset">
						{PROVIDER_PRESETS.map((preset) => (
							<button
								key={preset.kind}
								type="button"
								className="preset__item"
								onClick={() => startNew(preset)}
							>
								<span className="preset__label">{preset.label}</span>
								<span className="preset__desc">{preset.description}</span>
							</button>
						))}
					</div>
					<div className="row" style={{ gap: 'var(--space-3)' }}>
						<button
							type="button"
							className="button button--ghost button--sm"
							onClick={() => setPresetsOpen(false)}
						>
							Cancel
						</button>
					</div>
				</SettingsCard>
			) : (
				<div className="section__action">
					<button type="button" className="button" onClick={() => setPresetsOpen(true)}>
						<Plus size={18} />
						Add provider
					</button>
				</div>
			)}

			{editing && (
				<ProviderEditor
					key={editing.id}
					provider={editing}
					isNew={isNew}
					onCancel={() => setEditing(null)}
					onSave={(provider) => {
						updateSettings((current) => {
							const exists = current.providers.some((entry) => entry.id === provider.id)
							const providers = exists
								? current.providers.map((entry) => (entry.id === provider.id ? provider : entry))
								: [...current.providers, provider]
							// Adding a provider is an intent to use it: make its first model the default.
							const defaultModel =
								!exists && provider.models[0]
									? { providerId: provider.id, modelId: provider.models[0] }
									: (current.defaultModel ??
										(provider.models[0]
											? { providerId: provider.id, modelId: provider.models[0] }
											: null))
							return { ...current, providers, defaultModel }
						})
						setEditing(null)
					}}
				/>
			)}
		</div>
	)
}

function ProviderEditor({
	provider,
	isNew,
	onSave,
	onCancel,
}: {
	provider: ProviderSettings
	isNew: boolean
	onSave: (provider: ProviderSettings) => void
	onCancel: () => void
}) {
	const [draft, setDraft] = useState<ProviderSettings>(provider)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [granted, setGranted] = useState<boolean | null>(null)

	const patch = (update: Partial<ProviderSettings>) => setDraft((current) => ({ ...current, ...update }))

	/** Ask the server what it has. The table shows the answer; only a failure needs words. */
	const refreshModels = async () => {
		setBusy(true)
		setError(null)
		try {
			// Must be the first await of the click: Chrome only shows the permission
			// prompt while a user gesture is still live.
			if (draft.baseURL && !(await requestHostAccess(draft.baseURL))) {
				setGranted(false)
				setError(
					`Chrome did not grant access to ${hostOf(draft.baseURL)}. Use “Grant host access” to try again.`,
				)
				return
			}
			setGranted(true)
			const details = await discoverModels(draft)
			// A refresh never guesses which ids are chat models, so it only seeds `models`
			// when the list is still empty. Afterwards the Use ticks are the user's and a
			// refresh just updates the facts beside them.
			const models =
				draft.models.length > 0
					? draft.models
					: [...new Set(details.map((model) => model.id))].sort((a, b) => a.localeCompare(b))
			patch({ models, modelDetails: details })
		} catch (caught) {
			setError(toAppError(caught).message)
		} finally {
			setBusy(false)
		}
	}

	const checkAccess = async () => {
		if (!draft.baseURL) return
		setGranted(await hasHostAccess(draft.baseURL))
	}

	/** Nothing may await before this: the permission prompt needs the click's gesture. */
	const grantHostAccess = async () => {
		if (!draft.baseURL) return
		setGranted(await requestHostAccess(draft.baseURL))
	}

	const save = async () => {
		// Saving is the user asking to use this endpoint, so ask for the grant now, while
		// the click's gesture is live. Generate-and-send later has no prompt available.
		if (draft.kind !== 'prompt-api' && draft.baseURL && !(await requestHostAccess(draft.baseURL))) {
			setGranted(false)
			setError(`Chrome did not grant access to ${hostOf(draft.baseURL)}. Use “Grant host access” to try again.`)
			return
		}
		const models = draft.models.map((id) => id.trim()).filter(Boolean)
		onSave({
			...draft,
			label: draft.label.trim() || 'Provider',
			baseURL: draft.kind === 'prompt-api' ? undefined : draft.baseURL?.trim(),
			models: draft.kind === 'prompt-api' ? ['text'] : [...new Set(models)],
			modelDetails: draft.modelDetails ? dedupeDetails(draft.modelDetails) : undefined,
		})
	}

	if (draft.kind === 'prompt-api') {
		return (
			<SettingsCard title={isNew ? 'Built-in browser model' : draft.label}>
				<p className="section__intro">
					Chrome and Edge ship a small model. Nothing leaves the device and no key is needed. Download it from
					the side panel the first time you use it.
				</p>
				<div className="row" style={{ gap: 'var(--space-3)' }}>
					<button type="button" className="button button--primary" onClick={() => void save()}>
						{isNew ? 'Add provider' : 'Save'}
					</button>
					<button type="button" className="button button--ghost" onClick={onCancel}>
						Cancel
					</button>
				</div>
			</SettingsCard>
		)
	}

	return (
		<SettingsCard title={isNew ? 'New provider' : `Edit ${draft.label}`}>
			<div className="grid-2">
				<TextField label="Name" value={draft.label} onChange={(label) => patch({ label })} />
				<SelectField
					label="Type"
					value={draft.kind}
					options={[
						{ value: 'openai-compatible', label: 'Local / OpenAI-compatible' },
						{ value: 'openai', label: 'OpenAI' },
						{ value: 'anthropic', label: 'Anthropic' },
						{ value: 'deepseek', label: 'DeepSeek' },
					]}
					onChange={(kind) =>
						patch({
							kind: kind as ProviderKind,
							baseURL: draft.baseURL || DEFAULT_BASE_URLS[kind],
						})
					}
				/>
			</div>

			{/* One host control, under the URL it is about: the grant belongs to this endpoint, not
			    to the model list. It is a plain div, not `Field`, because a button inside a label
			    would fire twice. */}
			<div className="field field--stacked">
				<span className="field__text">
					<span className="field__label">Base URL</span>
					<span className="field__hint">
						{draft.kind === 'openai-compatible'
							? 'Examples: llama.cpp http://localhost:9931/v1 · Ollama http://localhost:11434/v1 · LM Studio http://localhost:1234/v1'
							: 'The /v1 endpoint. Trailing /chat/completions is removed.'}
					</span>
				</span>
				<div className="url-row">
					<input
						className="input"
						value={draft.baseURL ?? ''}
						placeholder={DEFAULT_BASE_URLS[draft.kind]}
						aria-label="Base URL"
						onChange={(event) => patch({ baseURL: event.target.value })}
						spellCheck={false}
						autoComplete="off"
					/>
					<button
						type="button"
						className="button button--ghost button--sm"
						onClick={() => void checkAccess()}
						disabled={!draft.baseURL}
					>
						Check site access
					</button>
				</div>
				{granted === true && (
					<span className="url-access url-access--granted">
						<CircleCheck size={14} />
						Host access granted.
					</span>
				)}
				{granted === false && (
					<span className="url-access url-access--missing">
						<CircleAlert size={14} />
						Chrome has not granted access to {draft.baseURL ? hostOf(draft.baseURL) : 'this host'}.
						<button
							type="button"
							className="button button--primary button--sm"
							onClick={() => void grantHostAccess()}
						>
							Grant host access
						</button>
					</span>
				)}
			</div>

			<TextField
				label="API key"
				type="password"
				value={draft.apiKey ?? ''}
				onChange={(apiKey) => patch({ apiKey })}
				hint="Stored locally and sent only to this endpoint. Leave empty for servers that do not need a key."
			/>

			<div className="grid-2">
				<Field
					label="Context window override"
					hint="Only needed when the server does not report it. In tokens."
				>
					<input
						className="input"
						type="number"
						min={512}
						value={draft.contextWindowOverride ?? ''}
						placeholder="auto"
						onChange={(event) =>
							patch({
								contextWindowOverride: event.target.value ? Number(event.target.value) : undefined,
							})
						}
					/>
				</Field>
				<Field label="Max output override" hint="Optional cap on generated tokens.">
					<input
						className="input"
						type="number"
						min={256}
						value={draft.maxOutputTokensOverride ?? ''}
						placeholder="auto"
						onChange={(event) =>
							patch({
								maxOutputTokensOverride: event.target.value ? Number(event.target.value) : undefined,
							})
						}
					/>
				</Field>
			</div>

			<div className="field field--stacked">
				<span className="field__text">
					<span className="field__label">Models</span>
					<span className="field__hint">
						Refresh asks the server what it has. Unticked models stay out of the pickers; a ~ marks a figure
						the catalog estimated rather than the server’s own.
					</span>
				</span>
				<ProviderModelTable provider={draft} onChange={patch} />
			</div>

			<div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
				<button
					type="button"
					className="button button--sm"
					onClick={() => void refreshModels()}
					disabled={busy}
					title="Ask the server for its model list"
				>
					<RefreshCw size={16} />
					{busy ? 'Refreshing…' : 'Refresh'}
				</button>
			</div>

			{error && (
				<div className="notice notice--bad" role="alert">
					{error}
				</div>
			)}

			<div className="row" style={{ gap: 'var(--space-3)' }}>
				<button type="button" className="button button--primary" onClick={() => void save()}>
					{isNew ? 'Add provider' : 'Save provider'}
				</button>
				<button type="button" className="button button--ghost" onClick={onCancel}>
					Cancel
				</button>
			</div>
		</SettingsCard>
	)
}
