import { useState } from 'react'
import type { AppSettings, PromptTemplate, ToolSettings } from '../../core/types'
import { BookMarked, ChevronDown, Wrench } from 'lucide-react'
import { mcpServerKey } from '../../core/mcp'
import { enabledBuiltInTools } from '../../core/settings'
import { isMcpToolEnabled } from '../../core/tool-selection'
import { mcpCatalogStore, type McpCatalogEntry } from '../../state/mcp'
import { useStore } from '../useStore'
import { Popover } from './Popover'
import { SettingsButton } from './SettingsButton'
import { ToolTree } from './ToolTree'

export function PromptTemplateMenu({
	templates,
	onSelect,
}: {
	templates: PromptTemplate[]
	onSelect: (template: PromptTemplate) => void
}) {
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')

	if (templates.length === 0) return null

	const needle = query.trim().toLowerCase()
	const matches = needle
		? templates.filter(
				(template) =>
					template.name.toLowerCase().includes(needle) ||
					(template.description ?? '').toLowerCase().includes(needle),
			)
		: templates

	return (
		<Popover
			open={open}
			onClose={() => setOpen(false)}
			width={300}
			align="start"
			trigger={
				<button
					type="button"
					className="chip"
					onClick={() => setOpen((value) => !value)}
					title="Prompt templates"
				>
					<BookMarked size={12} />
					<span className="chip__text">Templates</span>
					<ChevronDown size={12} />
				</button>
			}
		>
			<div className="popover__header">
				<input
					className="input input--compact"
					placeholder="Search templates"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					autoFocus
				/>
				<SettingsButton
					section="prompt-templates"
					label="Manage prompt templates"
					onClose={() => setOpen(false)}
				/>
			</div>
			<div className="popover__list">
				<div className="popover__group">
					<div className="popover__group-label">Insert a prompt</div>
					{matches.length === 0 && <p className="popover__empty">No templates match.</p>}
					{matches.map((template) => (
						<button
							key={template.id}
							type="button"
							className="popover__item popover__item--stacked"
							onClick={() => {
								onSelect(template)
								setOpen(false)
							}}
						>
							<span className="popover__item-main">{template.name}</span>
							{template.description && <span className="popover__item-sub">{template.description}</span>}
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
