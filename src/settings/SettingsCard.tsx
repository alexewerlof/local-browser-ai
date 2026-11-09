import type { ReactNode } from 'react'

/**
 * A Chrome settings group: a secondary-coloured heading followed by a card.
 * Rows inside the card are separated by hairlines (see settings.css).
 *
 * `titleBefore`, `titleAfter` and `actions` share the heading row: a tool set puts its
 * availability checkbox before the name, its badges after it and its bulk controls on the
 * trailing edge, which is what makes a built-in set and an MCP server look like the same
 * kind of thing.
 */
export function SettingsCard({
	title,
	titleBefore,
	titleAfter,
	hint,
	actions,
	children,
	className,
}: {
	title?: string
	titleBefore?: ReactNode
	titleAfter?: ReactNode
	hint?: ReactNode
	actions?: ReactNode
	children: ReactNode
	className?: string
}) {
	return (
		<section className="group">
			{title && (
				<div className="group__head">
					{titleBefore}
					<div className="group__head-text">
						<div className="group__head-title">
							<h2 className="group__title">{title}</h2>
							{titleAfter}
						</div>
						{hint && <span className="group__hint">{hint}</span>}
					</div>
					{actions && <div className="group__actions">{actions}</div>}
				</div>
			)}
			<div className={className ? `card ${className}` : 'card'}>{children}</div>
		</section>
	)
}
