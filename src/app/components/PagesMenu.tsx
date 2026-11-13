import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Plus, Trash2 } from 'lucide-react'
import type { PageSnapshot } from '../../core/types'
import { stampIso, stampTime, stampTooltip } from '../../core/util'
import { lastPageAddedStore } from '../../state/pages'
import { useBarMenu } from '../menu-bar'
import { useStore } from '../useStore'
import { MenuButton } from './MenuButton'
import { Popover } from './Popover'

/** The id the trigger points at while the menu is open (`aria-controls`). */
const PAGES_LIST_ID = 'pages-menu-list'

/** This item's place on the menu bar. */
const PAGES_MENU = 'pages-menu__trigger'

/** The row the list shows while a page is being captured and converted. */
const ADDING_PAGE = 'Adding the page…'

/** The host of a page without the noise of `www.`, or the raw URL when it does not parse. */
function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return url
	}
}

/**
 * The chat's pages, as the first menu of the composer's menu bar.
 *
 * The pages belong in a menu rather than in a band above the prompt: a chat with three pages
 * spent three rows of the panel on a list the user looks at once per add, and the prompt paid
 * for it in height. The bar says how many there are — the count is in the trigger, so the
 * list can stay closed — and the menu opens to the rows themselves.
 *
 * The header is the same shape as every other menu: a search box, and one button on the
 * trailing edge. Here that button is **+** rather than the gear, because this menu's content
 * is the chat's own pages and the one action it owns is adding one. The search matches the
 * title the row shows and the URL behind it, which is what a user with four captures of the
 * same document reaches for. It deliberately takes no focus when the menu opens: a capture
 * opens the menu on its own, and a search field that grabbed the caret would take it out of
 * the prompt the user was typing in.
 *
 * A page that has not reached a turn yet is dimmed and carries a trash can: its block is not
 * in any request, so it can still be taken back. Once a turn carries it, the page is part of
 * the transcript and only stays openable. Each row carries the moment its capture happened,
 * because one chat can hold the same page more than once and two captures of a document
 * differ only by that stamp.
 *
 * The menu opens itself when a page arrives, from the context menu, the toolbar button, a
 * search or a tool: a count changing in a closed menu is too quiet a signal, and the new row
 * is one click from the trash can if the add was a mistake. An add also clears the search, so
 * a filter typed before the page landed cannot hide it.
 */
export function PagesMenu({
	pages,
	conversationId,
	busy,
	addDisabled,
	addTitle,
	onAdd,
	onOpen,
	onRemove,
}: {
	/** The pages of this chat, in the order they were added. */
	pages: PageSnapshot[]
	/** Switching chats closes the menu: it lists one chat's pages. */
	conversationId: string
	/** True while a page is being captured and converted, which is the count's pulse. */
	busy: boolean
	addDisabled: boolean
	/** What the add button would capture, named for the button's tooltip. */
	addTitle: string
	onAdd: () => void
	onOpen: (page: PageSnapshot) => void
	onRemove: (page: PageSnapshot) => void
}) {
	// The bar callbacks are stable per item, so the effects below are keyed on the events that
	// should open or close this menu — never on a re-render.
	const { open, show, toggle, hover, close: closeBar } = useBarMenu(PAGES_MENU)
	const [query, setQuery] = useState('')
	const lastPageAdded = useStore(lastPageAddedStore)
	/**
	 * The chat the menu was last pointed at. A capture lands in the same tick as a new chat
	 * (the omnibox adds a page to a chat it just created), so a switch is only a switch when
	 * the id really moved — an effect that ran on mount would close the menu the page effect
	 * had just opened.
	 */
	const chatRef = useRef(conversationId)

	/** Closing also forgets the filter: the next opening starts on the whole list. */
	const close = useCallback(() => {
		closeBar()
		setQuery('')
	}, [closeBar])

	// A page that just joined opens the menu, with any filter cleared so the new row is there.
	// A restored chat appends nothing, so reopening the panel still starts with it closed.
	useEffect(() => {
		if (!lastPageAdded) return
		show()
		setQuery('')
	}, [lastPageAdded, show])

	// The pages belong to one chat, so the menu does not survive a switch.
	useEffect(() => {
		if (chatRef.current === conversationId) return
		chatRef.current = conversationId
		closeBar()
		setQuery('')
	}, [conversationId, closeBar])

	// A date is only shown for a capture on another day, so this only has to be "now" and is
	// read once per render — it is not a state change anyone can observe.
	const reference = Date.now()
	const needle = query.trim().toLowerCase()
	const matches = needle
		? pages.filter(
				(page) =>
					page.title.toLowerCase().includes(needle) ||
					page.url.toLowerCase().includes(needle) ||
					hostOf(page.url).includes(needle),
			)
		: pages

	return (
		<Popover
			open={open}
			onClose={close}
			width={320}
			align="start"
			flush
			trigger={
				<MenuButton
					block={PAGES_MENU}
					label="Pages"
					count={pages.length}
					countBusy={busy}
					title="Pages in this chat"
					expanded={open}
					controls={open ? PAGES_LIST_ID : undefined}
					onClick={toggle}
					onHover={hover}
				/>
			}
		>
			<div className="popover__header">
				<input
					className="input input--compact"
					placeholder="Search pages"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
				/>
				<button
					type="button"
					className="button button--ghost button--icon button--sm pages-menu__add"
					onClick={() => {
						// The grant box asks above the composer, so the menu must not cover it.
						close()
						onAdd()
					}}
					disabled={addDisabled}
					title={addTitle}
					aria-label="Add page to chat"
				>
					<Plus size={13} />
				</button>
			</div>

			<div className="popover__list">
				<div className="popover__group">
					<div className="popover__group-label">Pages in this chat</div>
					{busy && <p className="popover__empty">{ADDING_PAGE}</p>}
					{pages.length === 0 && !busy && <p className="popover__empty">No pages in this chat.</p>}
					{pages.length > 0 && matches.length === 0 && <p className="popover__empty">No pages match.</p>}
					{matches.length > 0 && (
						<ol className="pages-menu__list" id={PAGES_LIST_ID} aria-label="Pages in this chat">
							{matches.map((page) => {
								const title = page.title || hostOf(page.url)
								const pending = !page.messageId
								const stamp = stampTime(page.capturedAt, reference)
								return (
									<li
										key={page.id}
										className={`pages-menu__item${pending ? ' pages-menu__item--pending' : ''}`}
									>
										<button
											type="button"
											className="page-chip page-chip--list"
											onClick={() => {
												close()
												onOpen(page)
											}}
											title={page.url}
											aria-label={`Open ${title} — ${page.url}${stamp ? `, added ${stamp}` : ''}`}
										>
											{page.faviconUrl ? (
												<img
													className="page-chip__icon"
													src={page.faviconUrl}
													alt=""
													width={12}
													height={12}
												/>
											) : (
												<FileText size={12} />
											)}
											<span className="page-chip__title">{title}</span>
											{/* `dateTime` is the machine-readable instant; the tooltip spells
											    it out in the user's own locale, so the row is never the only
											    thing a reader gets. */}
											<time
												className="page-chip__stamp"
												dateTime={stampIso(page.capturedAt)}
												title={stampTooltip(page.capturedAt)}
											>
												{stamp}
											</time>
											<span className="page-chip__host">{hostOf(page.url)}</span>
										</button>
										{pending && (
											<button
												type="button"
												className="pages-menu__remove"
												onClick={() => onRemove(page)}
												title="Remove from this chat"
												aria-label={`Remove ${title} from this chat`}
											>
												<Trash2 size={13} />
											</button>
										)}
									</li>
								)
							})}
						</ol>
					)}
				</div>
			</div>
		</Popover>
	)
}
