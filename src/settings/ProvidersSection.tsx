import { useState } from 'react'
import { CircleAlert, CircleCheck, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import type { AppSettings, ModelDetails, ModelRef, ProviderSettings } from '../core/types'
import { insecureEndpoint } from '../core/endpoint'
import { resolveDefaultModel } from '../core/settings'
import { createId } from '../core/util'
import { DEFAULT_BASE_URL } from '../providers/registry'
import { discoverModels } from '../providers/discovery'
import { toAppError } from '../providers/errors'
import { hasHostAccess, hostOf, requestHostAccess } from '../platform/permissions'
import { updateSettings } from '../state/settings'
import { Field, TextField } from './fields'
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

	const startNew = () => {
		setEditing({
			id: createId('prov'),
			label: 'Local server',
			baseURL: DEFAULT_BASE_URL,
			apiKey: '',
			models: [],
		})
		setIsNew(true)
	}

	return (
		<div className="section">
			<p className="section__intro">
				Providers are model endpoints. A local server runs on your machine or network: llama.cpp, Ollama, LM
				Studio, Jan, vLLM, or anything else serving an OpenAI-compatible API. Everything is stored in this
				browser profile.
			</p>

			<SettingsCard title="Configured providers">
				{settings.providers.length === 0 ? (
					<p className="card__note">
						No provider yet. Add your local model server below; llama.cpp, Ollama, LM Studio, Jan and vLLM
						all serve an OpenAI-compatible API.
					</p>
				) : (
					<div className="rows">
						{settings.providers.map((provider) => (
							<div key={provider.id} className="provider">
								<div className="provider__main">
									<span className="provider__label">
										{provider.label}
										{settings.defaultModel?.providerId === provider.id && (
											<span
												className="badge badge--accent"
												title={`New chats start with ${settings.defaultModel.modelId}`}
											>
												default
											</span>
										)}
									</span>
									<span className="provider__meta">
										{`${provider.baseURL ?? '—'} · ${provider.models.length} models`}
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
								<button
									type="button"
									className="button button--danger button--sm"
									onClick={() => {
										updateSettings((current) => {
											const providers = current.providers.filter(
												(entry) => entry.id !== provider.id,
											)
											// A default that lived on this provider is no longer offered, so
											// the resolver moves it to the first model that is.
											return {
												...current,
												providers,
												defaultModel: resolveDefaultModel(providers, current.defaultModel),
											}
										})
									}}
								>
									Remove
								</button>
							</div>
						))}
					</div>
				)}
			</SettingsCard>

			<div className="section__action">
				<button type="button" className="button" onClick={startNew}>
					<Plus size={18} />
					Add provider
				</button>
			</div>

			{editing && (
				<ProviderEditor
					key={editing.id}
					provider={editing}
					isNew={isNew}
					defaultModel={settings.defaultModel}
					onCancel={() => setEditing(null)}
					onSave={(provider, makeDefaultModelId) => {
						updateSettings((current) => {
							const exists = current.providers.some((entry) => entry.id === provider.id)
							const providers = exists
								? current.providers.map((entry) => (entry.id === provider.id ? provider : entry))
								: [...current.providers, provider]
							// The star is an explicit choice, and a provider just added is an intent to use
							// it; anything else leaves the default where the user had it.
							const requested: ModelRef | null = makeDefaultModelId
								? { providerId: provider.id, modelId: makeDefaultModelId }
								: !exists && provider.models[0]
									? { providerId: provider.id, modelId: provider.models[0] }
									: null
							return {
								...current,
								providers,
								defaultModel: resolveDefaultModel(providers, current.defaultModel, requested),
							}
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
	defaultModel,
	onSave,
	onCancel,
}: {
	provider: ProviderSettings
	isNew: boolean
	/** The saved default, which seeds the table's star when it belongs to this provider. */
	defaultModel: ModelRef | null
	onSave: (provider: ProviderSettings, makeDefaultModelId: string | null) => void
	onCancel: () => void
}) {
	const [draft, setDraft] = useState<ProviderSettings>(provider)
	/* The star is a draft like every other field: it only moves the default when the
	 * provider is saved, so Cancel leaves the app exactly as it was. */
	const [defaultModelId, setDefaultModelId] = useState<string | null>(() =>
		defaultModel?.providerId === provider.id ? defaultModel.modelId : null,
	)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [granted, setGranted] = useState<boolean | null>(null)

	/** Plain HTTP to a remote host: the prompt leaves this machine readable. */
	const insecure = insecureEndpoint(draft.baseURL)

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
		if (draft.baseURL && !(await requestHostAccess(draft.baseURL))) {
			setGranted(false)
			setError(`Chrome did not grant access to ${hostOf(draft.baseURL)}. Use “Grant host access” to try again.`)
			return
		}
		const models = draft.models.map((id) => id.trim()).filter(Boolean)
		const kept = new Set(models)
		onSave(
			{
				...draft,
				label: draft.label.trim() || 'Provider',
				baseURL: draft.baseURL?.trim(),
				models: [...kept],
				modelDetails: draft.modelDetails ? dedupeDetails(draft.modelDetails) : undefined,
			},
			// A star on a model the save dropped (or one the user retyped) is not a choice.
			defaultModelId && kept.has(defaultModelId) ? defaultModelId : null,
		)
	}

	return (
		<SettingsCard title={isNew ? 'New provider' : `Edit ${draft.label}`}>
			<TextField label="Name" value={draft.label} onChange={(label) => patch({ label })} />

			{/* One host control, under the URL it is about: the grant belongs to this endpoint, not
			    to the model list. It is a plain div, not `Field`, because a button inside a label
			    would fire twice. */}
			<div className="field field--stacked">
				<span className="field__text">
					<span className="field__label">Base URL</span>
					<span className="field__hint">
						Examples: llama.cpp http://localhost:9931/v1 · Ollama http://localhost:11434/v1 · LM Studio
						http://localhost:1234/v1
					</span>
				</span>
				<div className="url-row">
					<input
						className="input"
						value={draft.baseURL ?? ''}
						placeholder={DEFAULT_BASE_URL}
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
				{/* Directly under the address it is about: the risk is the transport, not the
				    grant, so it shows even before Chrome has been asked for anything. */}
				{insecure && (
					<span className="url-warning">
						<TriangleAlert size={14} />
						<span>
							<strong>{insecure.title}.</strong> {insecure.detail}
						</span>
					</span>
				)}
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
						Refresh asks the server what it has. A model with Use switched off stays out of the pickers; a ~
						marks a figure the catalog estimated rather than the server’s own. The star makes a model the
						default for chats that have not picked one.
					</span>
				</span>
				<ProviderModelTable
					provider={draft}
					onChange={patch}
					defaultModelId={defaultModelId}
					onDefaultModelChange={setDefaultModelId}
				/>
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
