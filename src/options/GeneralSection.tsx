import { useEffect, useState } from 'react'
import type { AppSettings } from '../core/types'
import { defaultSystemPrompt } from '../core/settings'
import { formatBytes } from '../core/util'
import { clearConversations, storageEstimate } from '../state/database'
import { updateSettings } from '../state/settings'
import { getManifest } from '../platform/chrome'
import { RangeField, SelectField, Switch, TextAreaField } from './fields'
import { SettingsCard } from './SettingsCard'

/**
 * A row with a switch on the right. `Field` is a `<label>`, which must not contain another
 * interactive element, so these rows use the same class with a plain div.
 */
function ToggleRow({
	label,
	hint,
	checked,
	onChange,
}: {
	label: string
	hint: string
	checked: boolean
	onChange: (checked: boolean) => void
}) {
	return (
		<div className="field">
			<span className="field__text">
				<span className="field__label">{label}</span>
				<span className="field__hint">{hint}</span>
			</span>
			<Switch label={label} checked={checked} onChange={onChange} />
		</div>
	)
}

export function GeneralSection({ settings }: { settings: AppSettings }) {
	const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)
	const [cleared, setCleared] = useState(false)
	const manifest = getManifest()

	useEffect(() => {
		void storageEstimate().then(setEstimate)
	}, [cleared])

	return (
		<div className="section">
			<SettingsCard title="Appearance">
				<div className="grid-2">
					<SelectField
						label="Theme"
						value={settings.ui.theme}
						options={[
							{ value: 'system', label: 'Match the system' },
							{ value: 'light', label: 'Light' },
							{ value: 'dark', label: 'Dark' },
						]}
						onChange={(theme) =>
							updateSettings((current) => ({ ...current, ui: { ...current.ui, theme } }))
						}
					/>
					<SelectField
						label="Submit with"
						value={settings.ui.submitKey}
						options={[
							{ value: 'enter', label: 'Enter (Shift+Enter for a new line)' },
							{ value: 'mod+enter', label: 'Ctrl/Cmd+Enter' },
						]}
						onChange={(submitKey) =>
							updateSettings((current) => ({ ...current, ui: { ...current.ui, submitKey } }))
						}
					/>
				</div>
			</SettingsCard>

			<SettingsCard title="Rendering">
				<ToggleRow
					label="Math"
					hint="Typeset $$…$$ LaTeX in answers with KaTeX. Adds a small download the first time it is needed."
					checked={settings.rendering.math}
					onChange={(math) =>
						updateSettings((current) => ({ ...current, rendering: { ...current.rendering, math } }))
					}
				/>
				<ToggleRow
					label="Code highlighting"
					hint="Colour fenced code blocks with Shiki. Off by default: the highlighter and its grammars are the heaviest part of rendering."
					checked={settings.rendering.codeHighlighting}
					onChange={(codeHighlighting) =>
						updateSettings((current) => ({
							...current,
							rendering: { ...current.rendering, codeHighlighting },
						}))
					}
				/>
			</SettingsCard>

			<SettingsCard title="System prompt">
				<TextAreaField
					label="Instructions"
					value={settings.systemPrompt}
					rows={8}
					onChange={(systemPrompt) => updateSettings((current) => ({ ...current, systemPrompt }))}
					hint="Sent at the top of every request. Page content is added separately, with a note that it is untrusted data."
				/>
				<div className="row">
					<button
						type="button"
						className="button button--sm"
						disabled={settings.systemPrompt === defaultSystemPrompt}
						onClick={() => updateSettings((current) => ({ ...current, systemPrompt: defaultSystemPrompt }))}
					>
						Reset to default
					</button>
				</div>
			</SettingsCard>

			<SettingsCard title="Tool Calls">
				<RangeField
					label="Maximum tool steps per answer"
					min={1}
					max={12}
					step={1}
					value={settings.context.maxToolSteps}
					format={(value) => String(value)}
					onChange={(maxToolSteps) =>
						updateSettings((current) => ({ ...current, context: { ...current.context, maxToolSteps } }))
					}
					hint="Each step is one model call plus the tool calls it requested."
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
					<button
						type="button"
						className="button button--danger"
						onClick={async () => {
							await clearConversations()
							setCleared((value) => !value)
						}}
					>
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
