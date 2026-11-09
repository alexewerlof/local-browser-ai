import type { ReactNode } from 'react'
import { Checkbox } from '../app/components/Checkbox'
import { Switch } from './fields'

/**
 * One tool inside a tool set: availability is the checkbox the composer's Tools tree also
 * uses, and the switch on the trailing edge runs it without asking. Both live on the same
 * row so a built-in tool and an MCP tool read exactly alike.
 *
 * The caption says only "Auto-approve"; the tooltip and the accessible name carry the full
 * "Run without asking", which is the ontology's wording for the behaviour.
 */
export function ToolRow({
	label,
	badges,
	description,
	hint,
	enabled,
	autoApprove,
	disabled,
	onEnabledChange,
	onAutoApproveChange,
}: {
	label: string
	badges?: ReactNode
	description?: string
	/** A second line about approval, e.g. which form of the tool still asks. */
	hint?: string
	enabled: boolean
	autoApprove: boolean
	/** A tool of a server that is switched off cannot be used, and both controls say so. */
	disabled?: boolean
	onEnabledChange: (enabled: boolean) => void
	onAutoApproveChange: (autoApprove: boolean) => void
}) {
	return (
		<div className="row-item row-item--tool">
			<div className="row-item__main">
				<Checkbox label={`Enable ${label}`} checked={enabled} disabled={disabled} onChange={onEnabledChange} />
				<div className="row-item__text">
					<span className="row-item__title">
						{label}
						{badges}
					</span>
					{description && <span className="row-item__desc">{description}</span>}
					{hint && <span className="row-item__desc">{hint}</span>}
				</div>
			</div>
			<span className="row-item__control" title="Run without asking">
				<span className="row-item__caption">Auto-approve</span>
				<Switch
					label={`Run ${label} without asking`}
					title="Run without asking"
					checked={autoApprove}
					disabled={disabled || !enabled}
					onChange={onAutoApproveChange}
				/>
			</span>
		</div>
	)
}
