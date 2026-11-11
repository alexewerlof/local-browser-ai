import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Anchored popover that closes on outside click or Escape.
 *
 * `align` picks the edge the panel hangs from: `start` grows rightwards from the trigger's
 * left edge and `end` leftwards from its right edge, both opening above the trigger.
 * `trailing` pins the panel to the trailing edge of the composer toolbar — a trigger in the
 * middle of the row has neither of its own edges at the place the menu has to reach, so the
 * anchor goes static and the toolbar becomes the containing block instead.
 */
export function Popover({
	open,
	onClose,
	trigger,
	children,
	align = 'start',
	width = 280,
}: {
	open: boolean
	onClose: () => void
	trigger: ReactNode
	children: ReactNode
	align?: 'start' | 'end' | 'trailing'
	width?: number
}) {
	const anchorRef = useRef<HTMLDivElement>(null)
	const staticAnchor = align === 'trailing'

	useEffect(() => {
		if (!open) return
		const onPointerDown = (event: MouseEvent) => {
			if (anchorRef.current?.contains(event.target as Node)) return
			onClose()
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose()
		}
		document.addEventListener('mousedown', onPointerDown)
		document.addEventListener('keydown', onKeyDown)
		return () => {
			document.removeEventListener('mousedown', onPointerDown)
			document.removeEventListener('keydown', onKeyDown)
		}
	}, [open, onClose])

	return (
		<div className={staticAnchor ? 'popover-anchor popover-anchor--trailing' : 'popover-anchor'} ref={anchorRef}>
			{trigger}
			{open && (
				<div className={`popover popover--${align}`} style={{ width }}>
					{children}
				</div>
			)}
		</div>
	)
}
