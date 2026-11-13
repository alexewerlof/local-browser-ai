import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * Anchored panel that closes on outside click or Escape, and the body of a menu bar item
 * rather than a floating box.
 *
 * `align` picks the edge the panel hangs from: `start` grows rightwards from the trigger's
 * left edge and `end` leftwards from its right edge, both opening above the trigger. A `start`
 * panel that would run past the side panel is moved back inside it (see the layout effect), so
 * the last item of a menu bar can hang its menu from its own left edge like every other item
 * and still fit.
 *
 * `flush` makes the panel the body of the item: it sits on the item's own edge with no gap
 * and no rounding where they meet, and overlaps it by a pixel so the seam and the box's
 * shadow fall behind the item (see `.popover--flush`).
 */
export function Popover({
	open,
	onClose,
	trigger,
	children,
	align = 'start',
	width = 280,
	flush = false,
}: {
	open: boolean
	onClose: () => void
	trigger: ReactNode
	children: ReactNode
	align?: 'start' | 'end'
	width?: number
	flush?: boolean
}) {
	const anchorRef = useRef<HTMLDivElement>(null)
	const panelRef = useRef<HTMLDivElement>(null)

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

	/**
	 * Keep the panel inside the side panel. A menu hangs from its item's left edge, which is
	 * free for the first items of a bar and impossible for the last: a 300px model menu
	 * anchored on the fourth item would run past the screen on a narrow side panel. So the
	 * panel is measured once it has laid out and moved left by the overflow it would otherwise
	 * have, never past the left edge — a panel that fits is not touched at all, and the style
	 * is written straight to the node so a correction costs no second render.
	 */
	useLayoutEffect(() => {
		if (!open || align !== 'start') return
		const panel = panelRef.current
		if (!panel) return
		panel.style.left = ''
		const rect = panel.getBoundingClientRect()
		const viewport = document.documentElement.clientWidth
		let shift = Math.max(0, rect.right - viewport)
		if (rect.left - shift < 0) shift = rect.left
		if (shift > 0) panel.style.left = `${-shift}px`
	}, [open, align, width])

	return (
		<div className="popover-anchor" ref={anchorRef}>
			{trigger}
			{open && (
				<div
					ref={panelRef}
					className={`popover popover--${align}${flush ? ' popover--flush' : ''}`}
					style={{ width }}
				>
					{children}
				</div>
			)}
		</div>
	)
}
