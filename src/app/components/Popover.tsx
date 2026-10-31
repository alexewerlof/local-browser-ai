import { useEffect, useRef, type ReactNode } from 'react'

/** Anchored popover that closes on outside click or Escape. */
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
	align?: 'start' | 'end'
	width?: number
}) {
	const anchorRef = useRef<HTMLDivElement>(null)

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
		<div className="popover-anchor" ref={anchorRef}>
			{trigger}
			{open && (
				<div className={`popover popover--${align}`} style={{ width }}>
					{children}
				</div>
			)}
		</div>
	)
}
