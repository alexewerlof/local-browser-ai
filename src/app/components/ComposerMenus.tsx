import { useState } from 'react'
import type { AppSettings, Skill, ToolSettings } from '../../core/types'
import { ChevronDown, GraduationCap, Wrench } from 'lucide-react'
import { mcpServerKey } from '../../core/mcp'
import { enabledBuiltInTools } from '../../core/settings'
import { isMcpToolEnabled } from '../../core/tool-selection'
import { mcpCatalogStore, type McpCatalogEntry } from '../../state/mcp'
import { useStore } from '../useStore'
import { Popover } from './Popover'
import { SettingsButton } from './SettingsButton'
import { ToolTree } from './ToolTree'

export function SkillMenu({ skills, onSelect }: { skills: Skill[]; onSelect: (skill: Skill) => void }) {
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')

	if (skills.length === 0) return null

	const needle = query.trim().toLowerCase()
	const matches = needle
		? skills.filter(
				(skill) =>
					skill.name.toLowerCase().includes(needle) ||
					(skill.description ?? '').toLowerCase().includes(needle),
			)
		: skills

	return (
		<Popover
			open={open}
			onClose={() => setOpen(false)}
			width={300}
			align="start"
			trigger={
				<button type="button" className="chip" onClick={() => setOpen((value) => !value)} title="Skills">
					<GraduationCap size={12} />
					<span className="chip__text">Skills</span>
					<ChevronDown size={12} />
				</button>
			}
		>
			<div className="popover__header">
				<input
					className="input input--compact"
					placeholder="Search skills"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					autoFocus
				/>
				<SettingsButton section="skills" label="Manage skills" onClose={() => setOpen(false)} />
			</div>
			<div className="popover__list">
				<div className="popover__group">
					<div className="popover__group-label">Insert a prompt</div>
					{matches.length === 0 && <p className="popover__empty">No skills match.</p>}
					{matches.map((skill) => (
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
	onChange: (tools: ToolSettings) => void
	disabledReason?: string
}) {
	const [open, setOpen] = useState(false)
	const catalog = useStore(mcpCatalogStore)
	const enabledCount = countEnabledTools(settings, catalog)

	return (
		<Popover
			open={open}
			onClose={() => setOpen(false)}
			width={320}
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
					<span className="chip__count">{enabledCount}</span>
				</button>
			}
		>
			{disabledReason ? (
				<p className="popover__empty">{disabledReason}</p>
			) : (
				<ToolTree settings={settings} onChange={onChange} onClose={() => setOpen(false)} />
			)}
		</Popover>
	)
}

/**
 * What the chip's number counts: every tool the model could call right now. An MCP server
 * whose tools have not been discovered yet contributes nothing — it is switched on, but
 * until the server answers there is no tool to count, and counting the server itself would
 * make a server with all of its tools turned off look the same as one with six.
 */
function countEnabledTools(settings: AppSettings, catalog: Record<string, McpCatalogEntry>): number {
	const builtIn = enabledBuiltInTools(settings).length
	const remote = settings.tools.mcp.reduce((total, server) => {
		if (!server.enabled) return total
		const entry = catalog[mcpServerKey(server)]
		if (!entry) return total
		return total + entry.tools.filter((tool) => isMcpToolEnabled(server, tool.name)).length
	}, 0)
	return builtIn + remote
}
