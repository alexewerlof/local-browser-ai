import { useState } from 'react'
import { Check, ChevronDown, MessageCircleMore } from 'lucide-react'
import type { ThinkingSelection } from '../../core/types'
import type { ModelInfo } from '../../providers/catalog'
import { thinkingOptions } from '../../providers/catalog'
import type { ProviderKind } from '../../core/types'
import { Popover } from './Popover'

export function ThinkingMenu({
	kind,
	info,
	value,
	onChange,
}: {
	kind: ProviderKind
	info: ModelInfo
	value: ThinkingSelection
	onChange: (next: ThinkingSelection) => void
}) {
	const [open, setOpen] = useState(false)
	const options = thinkingOptions(kind, info)
	const supported = info.capabilities.reasoning

	if (!supported) return null

	const label = options.find((option) => option.value === value.level)?.label ?? 'Auto'

	return (
		<Popover
			open={open}
			onClose={() => setOpen(false)}
			width={220}
			align="start"
			trigger={
				<button
					type="button"
					className="chip"
					onClick={() => setOpen((current) => !current)}
					title="Reasoning effort"
				>
					<MessageCircleMore size={12} />
					<span className="chip__text">{label}</span>
					<ChevronDown size={12} />
				</button>
			}
		>
			<div className="popover__group">
				<div className="popover__group-label">Reasoning</div>
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						className={`popover__item${value.level === option.value ? ' popover__item--selected' : ''}`}
						onClick={() => {
							onChange({ level: option.value })
							setOpen(false)
						}}
					>
						<span className="popover__item-main">{option.label}</span>
						{value.level === option.value && <Check size={13} />}
					</button>
				))}
			</div>
		</Popover>
	)
}
