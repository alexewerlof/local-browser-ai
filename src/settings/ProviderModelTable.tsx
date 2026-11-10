import { useState } from 'react'
import { ChevronDown, CircleCheck, Plus, Star, Trash2 } from 'lucide-react'
import type { ModelDetails, ModelModality, ProviderSettings, ThinkingSelection } from '../core/types'
import { formatTokens } from '../core/util'
import {
	getModelInfo,
	isContextWindowEstimated,
	isMaxOutputEstimated,
	modelContextWindow,
	modelMaxOutputTokens,
	thinkingOptions,
} from '../providers/catalog'
import { ModalityIcon } from '../app/components/ModalityIcon'
import { Switch } from './fields'

/** The modalities of one direction. Each icon is named in its tooltip and its aria-label. */
function ModalityList({ values }: { values: ModelModality[] }) {
	if (values.length === 0) return <span className="models-table__muted">—</span>
	return (
		<span className="models-table__modalities">
			{values.map((value) => (
				<ModalityIcon key={value} modality={value} className="models-table__modality" />
			))}
		</span>
	)
}

/**
 * The models a provider offers, as a table rather than a textarea. A row carries the
 * facts the `/models` endpoint reported, the Use switch that decides whether the
 * pickers offer the model, a reasoning select per model and the star that makes one of
 * them the default for new chats.
 *
 * The rows are the union of the ids in `models` and the cached details, so a model the
 * server stopped reporting stays visible until the user removes it. There is no remove
 * button for a model the server reports — those are the server's, not the extension's;
 * switching **Use** off is what keeps one out of the pickers.
 */
export function ProviderModelTable({
	provider,
	onChange,
	defaultModelId,
	onDefaultModelChange,
}: {
	provider: ProviderSettings
	onChange: (update: Partial<ProviderSettings>) => void
	/** The id of this provider's model that is the default, if any. */
	defaultModelId: string | null
	onDefaultModelChange: (id: string | null) => void
}) {
	const [newModel, setNewModel] = useState('')

	const details = new Map((provider.modelDetails ?? []).map((model) => [model.id, model]))
	const ids = [...new Set([...provider.models, ...details.keys()])].sort((a, b) => a.localeCompare(b))

	const setIncluded = (id: string, included: boolean) => {
		const models = included ? [...provider.models, id] : provider.models.filter((model) => model !== id)
		onChange({ models: [...new Set(models)] })
		// A default that is no longer offered would be repaired on the next load anyway; doing
		// it here means the table shows what will happen.
		if (!included && defaultModelId === id) onDefaultModelChange(null)
	}

	const makeDefault = (id: string) => {
		// Only a ticked model reaches the pickers, so starring one also makes it available.
		if (!provider.models.includes(id)) onChange({ models: [...provider.models, id] })
		onDefaultModelChange(id)
	}

	const remove = (id: string) => {
		const modelDetails = (provider.modelDetails ?? []).filter((model) => model.id !== id)
		const modelThinking = { ...(provider.modelThinking ?? {}) }
		delete modelThinking[id]
		onChange({ models: provider.models.filter((model) => model !== id), modelDetails, modelThinking })
		if (defaultModelId === id) onDefaultModelChange(null)
	}

	const setThinking = (id: string, level: ThinkingSelection['level'] | '') => {
		const modelThinking = { ...(provider.modelThinking ?? {}) }
		if (level) modelThinking[id] = { level }
		else delete modelThinking[id]
		onChange({ modelThinking })
	}

	const add = () => {
		const id = newModel.trim()
		if (!id || provider.models.includes(id)) return
		onChange({ models: [...provider.models, id] })
		setNewModel('')
	}

	return (
		<div className="models">
			{ids.length > 0 ? (
				<div className="models__scroll">
					<table className="models-table">
						<thead>
							<tr>
								<th className="models-table__col-use">
									<span className="sr-only">Use</span>
								</th>
								<th>Model</th>
								<th className="models-table__col-modality">input</th>
								<th className="models-table__col-modality">output</th>
								<th className="models-table__col-num">Context</th>
								<th className="models-table__col-num">Max output</th>
								<th className="models-table__col-reasoning">Reasoning</th>
							</tr>
						</thead>
						<tbody>
							{ids.map((id) => (
								<ModelRow
									key={id}
									provider={provider}
									id={id}
									detail={details.get(id)}
									included={provider.models.includes(id)}
									isDefault={defaultModelId === id}
									onIncludedChange={(included) => setIncluded(id, included)}
									onDefault={() => makeDefault(id)}
									onRemove={() => remove(id)}
									onThinkingChange={(level) => setThinking(id, level)}
								/>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className="models__empty">Refresh to list the models this server offers, or add an id by hand.</p>
			)}

			<div className="models__add">
				<input
					className="input"
					value={newModel}
					placeholder="Add a model id"
					aria-label="Add a model id"
					onChange={(event) => setNewModel(event.target.value)}
					onKeyDown={(event) => {
						if (event.key !== 'Enter') return
						event.preventDefault()
						add()
					}}
					spellCheck={false}
					autoComplete="off"
				/>
				<button type="button" className="button button--sm" onClick={add} disabled={!newModel.trim()}>
					<Plus size={16} />
					Add model
				</button>
			</div>
		</div>
	)
}

function ModelRow({
	provider,
	id,
	detail,
	included,
	isDefault,
	onIncludedChange,
	onDefault,
	onRemove,
	onThinkingChange,
}: {
	provider: ProviderSettings
	id: string
	detail?: ModelDetails
	included: boolean
	isDefault: boolean
	onIncludedChange: (included: boolean) => void
	onDefault: () => void
	onRemove: () => void
	onThinkingChange: (level: ThinkingSelection['level'] | '') => void
}) {
	const info = getModelInfo(id)
	const reasoning = info.reasoning
	const context = modelContextWindow(provider, id)
	const maxOutput = modelMaxOutputTokens(provider, id)
	const name = detail?.label && detail.label !== id ? `${detail.label} (${id})` : id
	const options = reasoning ? thinkingOptions(info) : []

	return (
		<tr>
			<td className="models-table__col-use">
				<Switch label={`Use ${id}`} checked={included} onChange={onIncludedChange} />
			</td>
			{/* The id is the fact; the label is only a friendlier name for the same row. A long
			    id is ellipsised by CSS, and the title carries it in full. */}
			<td className="models-table__model">
				<div className="models-table__model-line">
					<span className="models-table__name" title={name}>
						{name}
					</span>
					{detail?.state === 'loaded' && (
						<span
							className="models-table__loaded"
							role="img"
							aria-label="Loaded in the server"
							title="Loaded in the server"
						>
							<CircleCheck size={13} />
						</span>
					)}
					{/* The star is the default marker, so it is always on screen: a state you only see
					    on hover is a state you cannot check. */}
					{isDefault ? (
						<span
							className="models-table__default models-table__default--on"
							role="img"
							aria-label="Default model"
							title="Default model"
						>
							<Star size={13} fill="currentColor" />
						</span>
					) : (
						<button
							type="button"
							className="button button--ghost button--icon button--sm models-table__default"
							title="Make default"
							aria-label={`Make ${id} the default model`}
							onClick={onDefault}
						>
							<Star size={13} />
						</button>
					)}
					{!detail && (
						<button
							type="button"
							className="button button--ghost button--icon button--sm models-table__remove"
							title="Remove this id"
							aria-label={`Remove ${id}`}
							onClick={onRemove}
						>
							<Trash2 size={13} />
						</button>
					)}
				</div>
			</td>
			<td className="models-table__cell-modality">
				<ModalityList values={detail?.inputModalities ?? []} />
			</td>
			<td className="models-table__cell-modality">
				<ModalityList values={detail?.outputModalities ?? []} />
			</td>
			<td
				className="models-table__num"
				title={
					isContextWindowEstimated(provider, id)
						? 'Estimated from the model catalog. Refresh for the server’s own figure.'
						: undefined
				}
			>
				{isContextWindowEstimated(provider, id) ? `~${formatTokens(context)}` : formatTokens(context)}
			</td>
			<td
				className="models-table__num"
				title={
					isMaxOutputEstimated(provider, id)
						? 'Estimated from the model catalog. Refresh for the server’s own figure.'
						: undefined
				}
			>
				{isMaxOutputEstimated(provider, id) ? `~${formatTokens(maxOutput)}` : formatTokens(maxOutput)}
			</td>
			<td className="models-table__reasoning">
				{reasoning ? (
					<span className="select-wrap">
						<select
							className="select"
							aria-label={`Reasoning effort for ${id}`}
							value={provider.modelThinking?.[id]?.level ?? ''}
							onChange={(event) =>
								onThinkingChange(event.target.value as ThinkingSelection['level'] | '')
							}
						>
							<option value="">Default</option>
							{options.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
						<ChevronDown className="select__chevron" size={14} />
					</span>
				) : (
					<span className="models-table__muted" title="This model has no reasoning control">
						—
					</span>
				)}
			</td>
		</tr>
	)
}
