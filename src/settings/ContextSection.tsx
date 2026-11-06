import type { AppSettings } from '../core/types'
import { updateSettings } from '../state/settings'
import { RangeField } from './fields'
import { SettingsCard } from './SettingsCard'

export function ContextSection({ settings }: { settings: AppSettings }) {
	const context = settings.context
	return (
		<div className="section">
			<p className="section__intro">
				The context window is shared by the system prompt, the added pages, earlier turns and the answer. When
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
		</div>
	)
}
