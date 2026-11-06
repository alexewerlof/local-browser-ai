import type { AppSettings, FontSize } from '../core/types'
import { updateSettings } from '../state/settings'
import { SelectField, Switch } from './fields'
import { SettingsCard } from './SettingsCard'

/** Chrome's own wording, with the designed size marked as recommended. */
const FONT_SIZE_OPTIONS: Array<{ value: FontSize; label: string }> = [
	{ value: 'very-small', label: 'Very small' },
	{ value: 'small', label: 'Small' },
	{ value: 'medium', label: 'Medium (Recommended)' },
	{ value: 'large', label: 'Large' },
	{ value: 'very-large', label: 'Very large' },
]

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

/** How the app looks and renders: theme, composer behaviour, type size and the opt-in renderers. */
export function AppearanceSection({ settings }: { settings: AppSettings }) {
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
				<SelectField
					label="Font size"
					value={settings.ui.fontSize}
					options={FONT_SIZE_OPTIONS}
					onChange={(fontSize) =>
						updateSettings((current) => ({ ...current, ui: { ...current.ui, fontSize } }))
					}
					hint="Applies to the side panel and to this page. Medium is the size the panel was designed around."
				/>
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
		</div>
	)
}
