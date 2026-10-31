import type { AppSettings } from '../core/types'
import { updateSettings } from '../state/settings'
import { RangeField, SelectField } from './fields'
import { SettingsCard } from './SettingsCard'

export function ContextSection({ settings }: { settings: AppSettings }) {
	const context = settings.context
	return (
		<div className="section">
			<p className="section__intro">
				The context window is shared by the system prompt, the attached page, earlier turns and the answer. When
				usage passes the compaction threshold, the oldest turns are summarized so the conversation can continue.
			</p>

			<SettingsCard title="Compaction">
				<RangeField
					label="Compact at"
					min={0.5}
					max={0.95}
					step={0.05}
					value={context.compactionThreshold}
					format={(value) => `${Math.round(value * 100)}%`}
					onChange={(compactionThreshold) =>
						updateSettings((current) => ({
							...current,
							context: { ...current.context, compactionThreshold },
						}))
					}
					hint="A percentage of the window. Lower means more, smaller summaries."
				/>
				<RangeField
					label="Keep recent turns"
					min={1}
					max={12}
					step={1}
					value={context.keepRecentTurns}
					format={(value) => `${value} turns`}
					onChange={(keepRecentTurns) =>
						updateSettings((current) => ({
							...current,
							context: { ...current.context, keepRecentTurns },
						}))
					}
					hint="Recent turns are never summarized."
				/>
				<RangeField
					label="Reserve for the answer"
					min={0.05}
					max={0.5}
					step={0.05}
					value={context.outputReserveRatio}
					format={(value) => `${Math.round(value * 100)}%`}
					onChange={(outputReserveRatio) =>
						updateSettings((current) => ({
							...current,
							context: { ...current.context, outputReserveRatio },
						}))
					}
				/>
			</SettingsCard>

			<SettingsCard title="Page context">
				<SelectField
					label="Attached page"
					value={context.pageContext}
					options={[
						{ value: 'auto', label: 'Use the strategy below' },
						{ value: 'always', label: 'Always include as much as fits' },
						{ value: 'never', label: 'Never include automatically' },
					]}
					onChange={(pageContext) =>
						updateSettings((current) => ({ ...current, context: { ...current.context, pageContext } }))
					}
					hint="With “never”, the model can still read the page through tools when it supports them."
				/>
				<SelectField
					label="Strategy"
					value={context.strategy}
					options={[
						{ value: 'tiered', label: 'Smart: whole page if it fits, otherwise outline + excerpts' },
						{ value: 'full', label: 'Whole page (truncate to fit)' },
						{ value: 'outline', label: 'Outline only, read sections with tools' },
					]}
					onChange={(strategy) =>
						updateSettings((current) => ({ ...current, context: { ...current.context, strategy } }))
					}
				/>
			</SettingsCard>

			<SettingsCard title="Tools">
				<RangeField
					label="Maximum tool steps per answer"
					min={1}
					max={12}
					step={1}
					value={context.maxToolSteps}
					format={(value) => String(value)}
					onChange={(maxToolSteps) =>
						updateSettings((current) => ({ ...current, context: { ...current.context, maxToolSteps } }))
					}
					hint="Each step is one model call plus the tool calls it requested."
				/>
			</SettingsCard>
		</div>
	)
}
