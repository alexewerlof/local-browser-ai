import { useEffect, useState } from 'react'
import type { AppSettings, Skill } from '../../core/types'
import { ChevronDown, GraduationCap, Wrench } from 'lucide-react'
import { TOOL_DEFINITIONS } from '../../browser/tools'
import { mcpServerKey } from '../../core/mcp'
import { mcpCatalogStore, refreshMcpServers } from '../../state/mcp'
import { useStore } from '../useStore'
import { Popover } from './Popover'
import { SettingsButton } from './SettingsButton'

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
	onToggleMcp,
	disabledReason,
}: {
	settings: AppSettings
	onChange: (enabled: string[]) => void
	onToggleMcp: (serverId: string, enabled: boolean) => void
	disabledReason?: string
}) {
	const [open, setOpen] = useState(false)
	const catalog = useStore(mcpCatalogStore)
	const enabled = new Set(settings.tools.enabled)
	const servers = settings.tools.mcp
	const enabledCount = enabled.size + servers.filter((server) => server.enabled).length

	// Opening the menu is a good moment to check which servers are up.
	useEffect(() => {
		if (!open || servers.length === 0) return
		void refreshMcpServers(servers)
		// Refresh when the menu opens, not on every settings change.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open])

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
					<span className="badge">{enabledCount}</span>
				</button>
			}
		>
			{disabledReason ? (
				<p className="popover__empty">{disabledReason}</p>
			) : (
				<>
					<div className="popover__group">
						<div className="popover__group-head">
							<span className="popover__group-label">Built-in tools</span>
							<SettingsButton
								section="tools"
								label="Manage built-in tools"
								onClose={() => setOpen(false)}
							/>
						</div>
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

					<div className="popover__group">
						<div className="popover__group-head">
							<span className="popover__group-label">MCP servers</span>
							<SettingsButton section="mcp" label="Manage MCP servers" onClose={() => setOpen(false)} />
						</div>
						{servers.map((server) => (
							<label key={server.id} className="popover__check">
								<input
									type="checkbox"
									checked={server.enabled}
									onChange={(event) => onToggleMcp(server.id, event.target.checked)}
								/>
								<span>
									<span className="popover__item-main">{server.label}</span>
									<span className="popover__item-sub">
										{mcpStatus(server, catalog[mcpServerKey(server)])}
									</span>
								</span>
							</label>
						))}
						{servers.length === 0 && <p className="popover__empty">No MCP servers yet.</p>}
					</div>
				</>
			)}
		</Popover>
	)
}

/** One line under a server name: how many of its tools are on, or why they are not. */
function mcpStatus(
	server: AppSettings['tools']['mcp'][number],
	entry: { status: 'idle' | 'loading' | 'ready' | 'error'; tools: Array<{ name: string }> } | undefined,
): string {
	if (!entry || entry.status === 'idle') return 'Not checked'
	if (entry.status === 'loading') return 'Checking…'
	if (entry.status === 'error') return 'Unreachable'
	const available = entry.tools.filter((tool) => !server.disabledTools.includes(tool.name)).length
	return `${available} of ${entry.tools.length} tools enabled`
}
