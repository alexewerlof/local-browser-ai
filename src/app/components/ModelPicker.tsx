import { useMemo, useState } from 'react'
import { Check, ChevronDown, Sparkles } from 'lucide-react'
import type { AppSettings, ModelRef } from '../../core/types'
import { modelContextWindow } from '../../providers/catalog'
import { formatTokens } from '../../core/util'
import { Popover } from './Popover'
import { SettingsButton } from './SettingsButton'

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
						contextWindow: modelContextWindow(provider, modelId),
					})),
			}))
			.filter((group) => group.models.length > 0)
	}, [settings.providers, query])

	const label = current ? current.modelId || 'Choose model' : 'Choose model'

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
						{models.map(({ modelId, contextWindow }) => {
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
									<span className="popover__item-main">{modelId}</span>
									<span className="badge">{formatTokens(contextWindow)}</span>
									{selected && <Check size={13} />}
								</button>
							)
						})}
					</div>
				))}
			</div>
		</Popover>
	)
}
