import { useMemo, useState } from 'react'
import type { AppSettings, ModelRef } from '../../core/types'
import { getModelInfo } from '../../providers/catalog'
import { openOptionsPage } from '../../platform/chrome'
import { formatTokens } from '../../core/util'
import { Popover } from './Popover'
import { Icon } from './Icon'

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
					.map((modelId) => ({
						modelId,
						info: getModelInfo(provider.kind, modelId),
					})),
			}))
			.filter((group) => group.models.length > 0)
	}, [settings.providers, query])

	const label = current
		? current.providerId === 'prompt-api'
			? 'Built-in model'
			: current.modelId || 'Choose model'
		: 'Choose model'

	return (
		<Popover
			open={open}
			onClose={() => setOpen(false)}
			width={320}
			align="start"
			trigger={
				<button
					type="button"
					className="chip chip--model"
					onClick={() => setOpen((value) => !value)}
					title="Change model"
				>
					<Icon name="sparkle" size={12} />
					<span className="chip__text">{label}</span>
					<Icon name="chevron-down" size={12} />
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
			</div>
			<div className="popover__list">
				{groups.length === 0 && <p className="popover__empty">No models. Add a provider in Settings.</p>}
				{groups.map(({ provider, models }) => (
					<div key={provider.id} className="popover__group">
						<div className="popover__group-label">{provider.label}</div>
						{models.map(({ modelId, info }) => {
							const selected = current?.providerId === provider.id && current.modelId === modelId
							return (
								<button
									key={`${provider.id}:${modelId}`}
									type="button"
									className={`popover__item${selected ? ' popover__item--selected' : ''}`}
									onClick={() => {
										onSelect({ providerId: provider.id, modelId })
										setOpen(false)
									}}
								>
									<span className="popover__item-main">
										{provider.kind === 'prompt-api' ? 'Built-in browser model' : modelId}
									</span>
									<span className="badge">{formatTokens(info.contextWindow)}</span>
									{selected && <Icon name="check" size={13} />}
								</button>
							)
						})}
					</div>
				))}
			</div>
			<div className="popover__footer">
				<button
					type="button"
					className="button button--ghost button--sm"
					onClick={() => {
						setOpen(false)
						void openOptionsPage()
					}}
				>
					<Icon name="settings" size={13} />
					Manage models
				</button>
			</div>
		</Popover>
	)
}
