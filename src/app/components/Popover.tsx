import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Anchored popover that closes on outside click or Escape.
 *
 * `align: 'fill'` stretches the panel across the nearest positioned ancestor instead of
 * hanging off its trigger — for a menu whose content needs the whole panel width. The
 * anchor then goes static so that ancestor (the composer box) is the containing block, and
 * `width` is ignored because the CSS fills both edges.
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
	align?: 'start' | 'end' | 'fill'
	width?: number
}) {
	const anchorRef = useRef<HTMLDivElement>(null)
	const fill = align === 'fill'

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
		<div className={fill ? 'popover-anchor popover-anchor--fill' : 'popover-anchor'} ref={anchorRef}>
			{trigger}
			{open && (
				<div className={`popover popover--${align}`} style={fill ? undefined : { width }}>
					{children}
				</div>
			)}
		</div>
	)
}
