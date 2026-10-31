import type { ReactNode } from 'react'

/**
 * A Chrome settings group: a secondary-coloured heading followed by a card.
 * Rows inside the card are separated by hairlines (see options.css).
 */
export function SettingsCard({
	title,
	children,
	className,
}: {
	title?: string
	children: ReactNode
	className?: string
}) {
	return (
		<section className="group">
			{title && <h2 className="group__title">{title}</h2>}
			<div className={className ? `card ${className}` : 'card'}>{children}</div>
		</section>
	)
}
