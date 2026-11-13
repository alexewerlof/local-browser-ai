import { useMemo, useState } from 'react'
import { ArrowRight, CircleCheck, MessageCircleMore, Star, TriangleAlert } from 'lucide-react'
import type { AppSettings, ModelModality, ModelRef } from '../../core/types'
import { insecureEndpoint } from '../../core/endpoint'
import {
	getModelInfo,
	isContextWindowEstimated,
	isMaxOutputEstimated,
	modelContextWindow,
	modelDetailsFor,
	modelMaxOutputTokens,
} from '../../providers/catalog'
import { formatTokens } from '../../core/util'
import { useBarMenu } from '../menu-bar'
import { ModalityIcon, MODALITY_ICONS } from './ModalityIcon'
import { MenuButton } from './MenuButton'
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
	onDefaultChange,
}: {
	settings: AppSettings
	current: ModelRef | null
	onSelect: (ref: ModelRef) => void
	onDefaultChange: (ref: ModelRef) => void
}) {
	const menu = useBarMenu('model-menu__trigger')
	const [query, setQuery] = useState('')

	const groups = useMemo(() => {
		const needle = query.trim().toLowerCase()
		return settings.providers
			.map((provider) => ({
				provider,
				insecure: insecureEndpoint(provider.baseURL),
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
			open={menu.open}
			onClose={menu.close}
			align="start"
			width={300}
			flush
			trigger={
				<MenuButton
					block="model-menu__trigger"
					label="Model"
					value={label}
					title="Change model"
					expanded={menu.open}
					onClick={menu.toggle}
					onHover={menu.hover}
				/>
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
				<SettingsButton section="providers" label="Manage model providers" onClose={menu.close} />
			</div>
			<div className="popover__list">
				{groups.length === 0 && <p className="popover__empty">No models. Add a provider in Settings.</p>}
				{groups.map(({ provider, insecure, models }) => (
					<div key={provider.id} className="popover__group">
						<div className="popover__group-label">
							{/* The warning belongs to the server, not to a model: every model in the group is
							    reached the same way, so the group's heading is where it is said once. */}
							{insecure && (
								<span
									className="popover__group-warning"
									role="img"
									aria-label={insecure.summary}
									title={insecure.summary}
								>
									<TriangleAlert size={12} />
								</span>
							)}
							<span className="popover__group-name">{provider.label}</span>
						</div>
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
								const isDefault =
									settings.defaultModel?.providerId === provider.id &&
									settings.defaultModel.modelId === modelId
								const context = estimatedTokens(contextWindow, contextEstimated)
								const output = estimatedTokens(maxOutputTokens, maxOutputEstimated)

								return (
									<div
										key={`${provider.id}:${modelId}`}
										className={`popover__model${selected ? ' popover__model--selected' : ''}`}
									>
										<button
											type="button"
											className="popover__item popover__item--model"
											onClick={() => {
												onSelect({ providerId: provider.id, modelId })
												menu.close()
											}}
										>
											<span className="popover__item-row">
												<span className="popover__item-main" title={modelId}>
													{modelId}
												</span>
												{details?.state === 'loaded' && (
													<span
														className="popover__item-loaded"
														role="img"
														aria-label="Loaded in the server"
														title="Loaded in the server"
													>
														<CircleCheck size={13} />
													</span>
												)}
											</span>
											<span className="popover__item-facts">
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
												<ModalityPair
													input={details?.inputModalities ?? []}
													output={details?.outputModalities ?? []}
												/>
												{reasoning && (
													<span
														className="popover__item-reasoning"
														role="img"
														aria-label="Reasoning"
														title="This model has a reasoning effort"
													>
														<MessageCircleMore size={12} />
													</span>
												)}
											</span>
										</button>
										{/* One click makes this the model new chats start with — the same control the
										    provider table has, so the default is set where the model is chosen. */}
										{isDefault ? (
											<span
												className="popover__item-star popover__item-star--on"
												role="img"
												aria-label="Default model"
												title="Default model"
											>
												<Star size={13} fill="currentColor" />
											</span>
										) : (
											<button
												type="button"
												className="popover__item-star"
												title="Make default"
												aria-label={`Make ${modelId} the default model`}
												onClick={() => onDefaultChange({ providerId: provider.id, modelId })}
											>
												<Star size={13} />
											</button>
										)}
									</div>
								)
							},
						)}
					</div>
				))}
			</div>
		</Popover>
	)
}
