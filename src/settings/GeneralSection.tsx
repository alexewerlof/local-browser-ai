import { useEffect, useState } from 'react'
import type { AppSettings } from '../core/types'
import { formatBytes } from '../core/util'
import { clearConversations, storageEstimate } from '../state/database'
import { updateSettings } from '../state/settings'
import { getManifest } from '../platform/chrome'
import { RangeField } from './fields'
import { SettingsCard } from './SettingsCard'

export function GeneralSection({ settings }: { settings: AppSettings }) {
	const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)
	const [cleared, setCleared] = useState(false)
	const manifest = getManifest()

	useEffect(() => {
		void storageEstimate().then(setEstimate)
	}, [cleared])

	const deleteAllChats = async () => {
		await clearConversations()
		setCleared((value) => !value)
	}

	return (
		<div className="section">
			<SettingsCard title="Tool Calls">
				<RangeField
					label="Maximum tool steps per answer"
					min={1}
					max={20}
					step={1}
					value={settings.context.maxToolSteps}
					format={(value) => String(value)}
					onChange={(maxToolSteps) =>
						updateSettings((current) => ({ ...current, context: { ...current.context, maxToolSteps } }))
					}
					hint="Each step is one model call plus the tool calls it requested. Continue on an answer spends another run."
				/>
			</SettingsCard>

			<SettingsCard title="Data">
				<p className="section__intro">
					Chats are stored in this browser profile (IndexedDB). API keys are stored in extension storage and
					are never synced. No analytics are sent anywhere.
				</p>
				{estimate && (
					<div className="progress-line">
						<span>
							{formatBytes(estimate.usage)} used
							{estimate.quota ? ` of ${formatBytes(estimate.quota)} available` : ''}
						</span>
					</div>
				)}
				<div className="row" style={{ gap: 'var(--space-3)' }}>
					<button type="button" className="button button--danger" onClick={() => void deleteAllChats()}>
						Delete all chats
					</button>
					{cleared && <span className="hint">Chats deleted.</span>}
				</div>
			</SettingsCard>

			<SettingsCard title="About">
				<p className="section__intro">
					{manifest.name} {manifest.version}. Page content is only read when you attach a tab, and is only
					sent to the provider you selected.
				</p>
				<div className="row" style={{ gap: 'var(--space-4)', flexWrap: 'wrap' }}>
					<a className="button button--sm" href="./privacy.txt" target="_blank" rel="noreferrer">
						Privacy
					</a>
					<a
						className="button button--sm"
						href="https://github.com/alexewerlof/local-browser-ai"
						target="_blank"
						rel="noreferrer"
					>
						Source code
					</a>
				</div>
			</SettingsCard>
		</div>
	)
}
