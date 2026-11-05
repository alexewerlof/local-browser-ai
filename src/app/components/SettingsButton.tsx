import { Settings } from 'lucide-react'
import type { SettingsSectionId } from '../../core/settings-routes'
import { openOptionsPage } from '../../platform/chrome'

/**
 * The gear that closes a popover and opens Settings at the section that owns its content.
 * Icon-only and right-aligned: the popover footer has room for one control, and the
 * accessible name is what the user reads in the tooltip.
 */
export function SettingsButton({
	section,
	label,
	onClose,
}: {
	section: SettingsSectionId
	label: string
	onClose: () => void
}) {
	return (
		<button
			type="button"
			className="button button--ghost button--icon button--sm"
			title={label}
			aria-label={label}
			onClick={() => {
				onClose()
				void openOptionsPage(section)
			}}
		>
			<Settings size={13} />
		</button>
	)
}
