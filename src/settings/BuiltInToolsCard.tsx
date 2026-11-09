import type { AppSettings, ToolSettings } from '../core/types'
import { TOOL_DEFINITIONS } from '../browser/tools'
import {
	builtInAutoApproveSelection,
	builtInSelection,
	setBuiltInAutoApprove,
	setBuiltInEnabled,
	setToolInList,
} from '../core/tool-selection'
import { updateSettings } from '../state/settings'
import { Checkbox } from '../app/components/Checkbox'
import { SettingsCard } from './SettingsCard'
import { ToolRow } from './ToolRow'

/**
 * The built-in tool set, rendered like one MCP server: a checkbox before the name for the
 * whole set, a bulk auto-approve checkbox on the trailing edge, and one row per tool with
 * its own checkbox and switch. Every write replaces either the enabled list or the
 * auto-approve list; nothing here knows about a provider.
 */
export function BuiltInToolsCard({ settings }: { settings: AppSettings }) {
	const enabled = settings.tools.enabled
	const approved = settings.tools.autoApprove
	const selection = builtInSelection(enabled)
	const approvedSelection = builtInAutoApproveSelection(approved)

	const update = (patch: Partial<ToolSettings>) =>
		updateSettings((current) => ({ ...current, tools: { ...current.tools, ...patch } }))

	return (
		<SettingsCard
			title="Built-in tools"
			titleBefore={
				<Checkbox
					label="Enable every built-in tool"
					checked={selection === 'all'}
					indeterminate={selection === 'some'}
					onChange={(checked) => update({ enabled: setBuiltInEnabled(enabled, checked) })}
				/>
			}
			actions={
				<span className="group__auto" title="Run without asking">
					<span className="group__auto-label">Auto-approve</span>
					<Checkbox
						label="Run every built-in tool without asking"
						checked={approvedSelection === 'all'}
						indeterminate={approvedSelection === 'some'}
						onChange={(checked) => update({ autoApprove: setBuiltInAutoApprove(approved, checked) })}
					/>
				</span>
			}
		>
			<div className="rows">
				{TOOL_DEFINITIONS.map((definition) => {
					const isEnabled = enabled.includes(definition.id)
					return (
						<ToolRow
							key={definition.id}
							label={definition.label}
							badges={
								<span className="badge">{definition.requiresApproval ? 'actions' : 'read-only'}</span>
							}
							description={definition.description}
							hint={definition.autoApproveHint}
							enabled={isEnabled}
							autoApprove={approved.includes(definition.id)}
							onEnabledChange={(checked) =>
								update({ enabled: setToolInList(enabled, definition.id, checked) })
							}
							onAutoApproveChange={(checked) =>
								update({ autoApprove: setToolInList(approved, definition.id, checked) })
							}
						/>
					)
				})}
			</div>
			<p className="card__note">
				The built-in browser model cannot call tools. When it is selected, page content is placed in the prompt
				instead, and memories are still injected.
			</p>
		</SettingsCard>
	)
}
