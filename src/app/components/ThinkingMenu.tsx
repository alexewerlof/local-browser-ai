import { Check } from 'lucide-react'
import type { ThinkingSelection } from '../../core/types'
import type { ModelInfo } from '../../providers/catalog'
import { thinkingOptions } from '../../providers/catalog'
import { useBarMenu } from '../menu-bar'
import { MenuButton } from './MenuButton'
import { Popover } from './Popover'

export function ThinkingMenu({
	info,
	value,
	onChange,
}: {
	info: ModelInfo
	value: ThinkingSelection
	onChange: (next: ThinkingSelection) => void
}) {
	const menu = useBarMenu('thinking-menu__trigger')
	const options = thinkingOptions(info)
	const supported = info.reasoning

	if (!supported) return null

	const label = options.find((option) => option.value === value.level)?.label ?? 'Auto'

	return (
		<Popover
			open={menu.open}
			onClose={menu.close}
			width={220}
			align="start"
			flush
			trigger={
				<MenuButton
					block="thinking-menu__trigger"
					label="Thinking"
					value={label}
					title="Reasoning effort"
					expanded={menu.open}
					onClick={menu.toggle}
					onHover={menu.hover}
				/>
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
							menu.close()
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
