import type { AppSettings } from '../core/types'
import { TOOL_DEFINITIONS } from '../browser/tools'
import { updateSettings } from '../state/settings'
import { Switch } from './fields'
import { SettingsCard } from './SettingsCard'

export function BuiltInToolsSection({ settings }: { settings: AppSettings }) {
	const enabled = new Set(settings.tools.enabled)
	const approved = new Set(settings.tools.autoApprove)

	const toggle = (list: 'enabled' | 'autoApprove', id: string, checked: boolean) =>
		updateSettings((current) => {
			const next = new Set(current.tools[list])
			if (checked) next.add(id)
			else next.delete(id)
			return { ...current, tools: { ...current.tools, [list]: [...next] } }
		})

	return (
		<div className="section">
			<p className="section__intro">
				Tools that run inside the browser: they read the pages you add, search them, search the web with your
				default search engine, check the current date and time, save and search memories, and open links.
				Read-only tools and web search run automatically; actions such as opening a link from the answer ask for
				approval on the message itself.
			</p>

			<SettingsCard title="Built-in tools">
				<div className="rows">
					{TOOL_DEFINITIONS.map((definition) => {
						const isEnabled = enabled.has(definition.id)
						const isApproved = approved.has(definition.id)
						return (
							<div key={definition.id} className="row-item">
								<div className="row-item__text">
									<span className="row-item__title">
										{definition.label}
										<span className="badge">
											{definition.requiresApproval ? 'actions' : 'read-only'}
										</span>
									</span>
									<span className="row-item__desc">{definition.description}</span>
									{definition.autoApproveHint && (
										<span className="row-item__desc">{definition.autoApproveHint}</span>
									)}
									<div className="tool-option">
										<Switch
											label={`Run ${definition.label} without asking`}
											checked={isApproved}
											disabled={!isEnabled}
											onChange={(checked) => toggle('autoApprove', definition.id, checked)}
										/>
										<span>Run without asking</span>
									</div>
								</div>
								<Switch
									label={`Enable ${definition.label}`}
									checked={isEnabled}
									onChange={(checked) => toggle('enabled', definition.id, checked)}
								/>
							</div>
						)
					})}
				</div>
			</SettingsCard>

			<div className="notice">
				The built-in browser model cannot call tools. When it is selected, page content is placed in the prompt
				instead, and memories are still injected.
			</div>
		</div>
	)
}
