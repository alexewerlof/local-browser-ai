import { useEffect, useRef } from 'react'

/**
 * The checkbox atom, shared by the composer's Tools tree and Settings → Tools so the two
 * surfaces cannot drift apart. It is a native input: the browser draws the tick and the
 * dash of a partly selected group, and `accent-color` gives it the app's accent.
 *
 * `indeterminate` is a DOM property rather than an attribute, so it has to be assigned to
 * the node; it is cleared while the box is checked, otherwise the dash would hide the tick.
 */
export function Checkbox({
	label,
	checked,
	indeterminate,
	disabled,
	onChange,
	className,
}: {
	label: string
	checked: boolean
	indeterminate?: boolean
	disabled?: boolean
	onChange: (checked: boolean) => void
	className?: string
}) {
	const ref = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (ref.current) ref.current.indeterminate = Boolean(indeterminate) && !checked
	}, [indeterminate, checked])

	return (
		<input
			ref={ref}
			type="checkbox"
			className={className ? `checkbox ${className}` : 'checkbox'}
			aria-label={label}
			checked={checked}
			disabled={disabled}
			onChange={(event) => onChange(event.target.checked)}
		/>
	)
}
