import { useState } from 'react'
import type { AppSettings, Skill } from '../../core/types'
import { ChevronDown, Sparkles, Wrench } from 'lucide-react'
import { TOOL_DEFINITIONS } from '../../browser/tools'
import { Popover } from './Popover'

export function SkillMenu({ skills, onSelect }: { skills: Skill[]; onSelect: (skill: Skill) => void }) {
	const [open, setOpen] = useState(false)

	if (skills.length === 0) return null

	return (
		<Popover
			open={open}
			onClose={() => setOpen(false)}
			width={300}
			align="start"
			trigger={
				<button type="button" className="chip" onClick={() => setOpen((value) => !value)} title="Skills">
					<Sparkles size={12} />
					<span className="chip__text">Skills</span>
					<ChevronDown size={12} />
				</button>
			}
		>
			<div className="popover__group">
				<div className="popover__group-label">Insert a prompt</div>
				{skills.map((skill) => (
					<button
						key={skill.id}
						type="button"
						className="popover__item popover__item--stacked"
						onClick={() => {
							onSelect(skill)
							setOpen(false)
						}}
					>
						<span className="popover__item-main">{skill.name}</span>
						{skill.description && <span className="popover__item-sub">{skill.description}</span>}
					</button>
				))}
			</div>
			<div className="popover__footer">
				<span className="hint">Manage skills in Settings</span>
			</div>
		</Popover>
	)
}

export function ToolsMenu({
	settings,
	onChange,
	disabledReason,
}: {
	settings: AppSettings
	onChange: (enabled: string[]) => void
	disabledReason?: string
}) {
	const [open, setOpen] = useState(false)
	const enabled = new Set(settings.tools.enabled)

	const toggle = (id: string) => {
		const next = new Set(enabled)
		if (next.has(id)) next.delete(id)
		else next.add(id)
		onChange([...next])
	}

	return (
		<Popover
			open={open}
			onClose={() => setOpen(false)}
			width={300}
			align="start"
			trigger={
				<button
					type="button"
					className={`chip${disabledReason ? ' chip--disabled' : ''}`}
					onClick={() => setOpen((value) => !value)}
					title={disabledReason ?? 'Tools the model may use'}
				>
					<Wrench size={12} />
					<span className="chip__text">Tools</span>
					<span className="badge">{settings.tools.enabled.length}</span>
				</button>
			}
		>
			{disabledReason ? (
				<p className="popover__empty">{disabledReason}</p>
			) : (
				<div className="popover__group">
					<div className="popover__group-label">Tools</div>
					{TOOL_DEFINITIONS.map((definition) => {
						const checked = enabled.has(definition.id)
						return (
							<label key={definition.id} className="popover__check">
								<input type="checkbox" checked={checked} onChange={() => toggle(definition.id)} />
								<span>
									<span className="popover__item-main">{definition.label}</span>
									<span className="popover__item-sub">{definition.description}</span>
								</span>
							</label>
						)
					})}
				</div>
			)}
			<div className="popover__footer">
				<span className="hint">Requires a model that supports tool calling.</span>
			</div>
		</Popover>
	)
}
