import { useMemo, useState } from 'react'
import { ArrowRight, Check, ChevronDown, MessageCircleMore, Sparkles } from 'lucide-react'
import type { AppSettings, ModelModality, ModelRef } from '../../core/types'
import {
	getModelInfo,
	isContextWindowEstimated,
	isMaxOutputEstimated,
	modelContextWindow,
	modelDetailsFor,
	modelMaxOutputTokens,
} from '../../providers/catalog'
import { formatTokens } from '../../core/util'
import { ModalityIcon, MODALITY_ICONS } from './ModalityIcon'
import { Popover } from './Popover'
import { SettingsButton } from './SettingsButton'

/** A token figure with the catalog's estimate mark, the same one the Settings table uses. */
function estimatedTokens(tokens: number, estimated: boolean): string {
	return `${estimated ? '~' : ''}${formatTokens(tokens)}`
}

/** The figures named in full, and the catalog's guess called a guess. */
function tokenTitle(context: string, output: string, estimated: boolean): string {
	const figures = `Context ${context} · Max output ${output}`
	if (!estimated) return figures
	return `${figures}. Estimated from the model catalog. Refresh for the server’s own figure.`
}

/** “Input: text, image · Output: text” — one sentence for the glyphs, read by a screen reader. */
function describeModalities(input: ModelModality[], output: ModelModality[]): string {
	const side = (values: ModelModality[]) => values.map((value) => MODALITY_ICONS[value].label).join(', ')
	return `Input: ${input.length > 0 ? side(input) : 'none'} · Output: ${output.length > 0 ? side(output) : 'none'}`
}

/**
 * The input and output modalities, one glyph each with the direction between them. A model
 * whose server reported nothing shows the dash Settings shows, so a row never guesses.
 */
function ModalityPair({ input, output }: { input: ModelModality[]; output: ModelModality[] }) {
	if (input.length === 0 && output.length === 0) {
		return (
			<span className="popover__item-muted" title="The server reported no modalities">
				—
			</span>
		)
	}

	const label = describeModalities(input, output)
	return (
		<span className="popover__item-modalities" role="img" aria-label={label} title={label}>
			{input.map((modality) => (
				<ModalityIcon
					key={modality}
					modality={modality}
					size={12}
					labelled={false}
					className="popover__item-modality"
				/>
			))}
			<ArrowRight className="popover__item-arrow" size={11} />
			{output.map((modality) => (
				<ModalityIcon
					key={modality}
					modality={modality}
					size={12}
					labelled={false}
					className="popover__item-modality"
				/>
			))}
		</span>
	)
}

export function ModelPicker({
	settings,
	current,
	onSelect,
}: {
	settings: AppSettings
	current: ModelRef | null
	onSelect: (ref: ModelRef) => void
}) {
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')

	const groups = useMemo(() => {
		const needle = query.trim().toLowerCase()
		return settings.providers
			.map((provider) => ({
				provider,
				models: provider.models
					.filter(
						(modelId) =>
							!needle ||
							modelId.toLowerCase().includes(needle) ||
							provider.label.toLowerCase().includes(needle),
					)
					.map((modelId) => {
						const details = modelDetailsFor(provider, modelId)
						return {
							modelId,
							details,
							contextWindow: modelContextWindow(provider, modelId),
							contextEstimated: isContextWindowEstimated(provider, modelId),
							maxOutputTokens: modelMaxOutputTokens(provider, modelId),
							maxOutputEstimated: isMaxOutputEstimated(provider, modelId),
							reasoning: getModelInfo(modelId).reasoning,
						}
					}),
			}))
			.filter((group) => group.models.length > 0)
	}, [settings.providers, query])

	const label = current ? current.modelId || 'Choose model' : 'Choose model'

	return (
		<Popover
			open={open}
			onClose={() => setOpen(false)}
			align="fill"
			trigger={
				<button
					type="button"
					className="chip chip--model"
					onClick={() => setOpen((value) => !value)}
					title="Change model"
				>
					<Sparkles size={12} />
					<span className="chip__text">{label}</span>
					<ChevronDown size={12} />
				</button>
			}
		>
			<div className="popover__header">
				<input
					className="input input--compact"
					placeholder="Search models"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					autoFocus
				/>
				<SettingsButton section="models" label="Manage models" onClose={() => setOpen(false)} />
			</div>
			<div className="popover__list">
				{groups.length === 0 && <p className="popover__empty">No models. Add a provider in Settings.</p>}
				{groups.map(({ provider, models }) => (
					<div key={provider.id} className="popover__group">
						<div className="popover__group-label">{provider.label}</div>
						{models.map(
							({
								modelId,
								details,
								contextWindow,
								contextEstimated,
								maxOutputTokens,
								maxOutputEstimated,
								reasoning,
							}) => {
								const selected = current?.providerId === provider.id && current.modelId === modelId
								const context = estimatedTokens(contextWindow, contextEstimated)
								const output = estimatedTokens(maxOutputTokens, maxOutputEstimated)

								return (
									<button
										key={`${provider.id}:${modelId}`}
										type="button"
										className={`popover__item popover__item--model${selected ? ' popover__item--selected' : ''}`}
										onClick={() => {
											onSelect({ providerId: provider.id, modelId })
											setOpen(false)
										}}
									>
										<span className="popover__item-row">
											<span className="popover__item-main" title={modelId}>
												{modelId}
											</span>
											<span
												className="popover__item-token"
												title={tokenTitle(
													context,
													output,
													contextEstimated || maxOutputEstimated,
												)}
											>
												{context} / {output}
											</span>
											{selected && <Check size={13} />}
										</span>
										<span className="popover__item-facts">
											<ModalityPair
												input={details?.inputModalities ?? []}
												output={details?.outputModalities ?? []}
											/>
											{reasoning && (
												<span
													className="popover__item-reasoning"
													title="This model has a reasoning effort"
												>
													<MessageCircleMore size={12} />
													Reasoning
												</span>
											)}
										</span>
									</button>
								)
							},
						)}
					</div>
				))}
			</div>
		</Popover>
	)
}
