/**
 * One item of the composer's menu bar, styled like a window menu rather than a chip: a word,
 * an optional live count in a pill, and an optional value the menu currently holds (the model
 * on screen, the reasoning effort). Every menu in the bar renders through this, so the words
 * share one type size, one height and one highlight — a bar whose items each styled
 * themselves would drift apart the first time one of them gained a count.
 *
 * The item is the trigger of a `Popover`, so it owns `aria-expanded`; `block` is the owning
 * component's class, which is what a test or a scenario reaches for when several items say
 * similar words.
 */
export function MenuButton({
	block,
	label,
	count,
	countBusy,
	value,
	title,
	expanded,
	controls,
	disabled,
	muted,
	onClick,
	onHover,
}: {
	/** The owning block's own class, e.g. `tools-menu__trigger`. */
	block: string
	/** The word on the bar: `Pages`, `Templates`, `Tools`, `Model`, `Thinking`. */
	label: string
	/** A live count shown in a pill, for menus whose content is a list that grows. */
	count?: number
	/** True while that list is being added to, which is what makes the pill pulse. */
	countBusy?: boolean
	/** What the menu currently holds, dimmed and ellipsised. */
	value?: string
	title?: string
	expanded: boolean
	/** The id of the list the menu shows, while it is open. */
	controls?: string
	disabled?: boolean
	/** Dimmed without being disabled: the menu still opens to say why it is empty. */
	muted?: boolean
	onClick: () => void
	/**
	 * The pointer arrived on this item. A menu bar uses it to hand an open menu over to the
	 * item under the pointer; a finger or a pen has no hover to hand over, so only a mouse
	 * reports it.
	 */
	onHover?: () => void
}) {
	return (
		<button
			type="button"
			className={`menu-item ${block}${muted ? ' menu-item--muted' : ''}`}
			aria-expanded={expanded}
			aria-controls={controls}
			title={title}
			disabled={disabled}
			onClick={onClick}
			onPointerEnter={
				onHover
					? (event) => {
							// A tap lands as a pointer enter just before its click, so following it
							// would open the menu and then let the click close it again. Only a
							// mouse hovers; a missing `pointerType` is a synthetic event in a test.
							if (event.pointerType === 'touch' || event.pointerType === 'pen') return
							onHover()
						}
					: undefined
			}
		>
			<span className="menu-item__label">{label}</span>
			{count !== undefined && (
				<span className={`menu-item__count${countBusy ? ' menu-item__count--busy' : ''}`}>{count}</span>
			)}
			{value !== undefined && <span className="menu-item__value">{value}</span>}
		</button>
	)
}
