import { ChevronDown, ChevronRight, FileText, Trash2 } from 'lucide-react'
import type { PageSnapshot } from '../../core/types'
import { stampIso, stampTime, stampTooltip } from '../../core/util'

/** The id the count points at while the list is open (`aria-controls`). */
const PAGE_LIST_ID = 'page-list-pages'

/** What the header says when the chat holds no pages yet. */
const NO_PAGES = '0 pages'
/** What it says instead while the first page is being captured and converted. */
const ADDING_PAGE = 'Adding the page…'

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return url
	}
}

/**
 * The pages of this chat as a header section of the composer: one transparent row — a
 * chevron, the count and `Add page` — and, under it, one row per page.
 *
 * The section is **not** the prompt editor. It sits above the box border, on the
 * composer's own background, and keeps its own clicks: the only frame in the composer is
 * the one around the editor, and only that border lights up when the prompt has focus. The
 * header and the box are one stack with no gap, so the list's last row meets the border and
 * the three still read as one area.
 *
 * The caption is the count, never an icon. With no pages it is a static `0 pages` and the
 * chevron is gone, because there is nothing to open — while `Add page` stays, so the control
 * that fills the list has one home and the row does not change shape when the first page
 * lands. The caption pulses while a page is being captured, which is the only progress
 * signal a local model's slow first page has.
 *
 * A page that has not reached a turn yet is dimmed and carries a trash can: its block is
 * not in any request, so it can still be taken back. Once a turn carries it the page is
 * part of the transcript and only stays openable.
 *
 * Each row carries the moment its page was captured, because one chat can hold the same
 * page more than once and two captures of a document differ only by that stamp. Nothing in
 * it is relative, so a list left open does not start lying; the tooltip spells the whole
 * instant out.
 */
export function PageList({
	pages,
	busy,
	open,
	addDisabled,
	addTitle,
	onToggle,
	onAdd,
	onOpen,
	onRemove,
}: {
	pages: PageSnapshot[]
	/** True while a page is being captured and converted, which is the caption's pulse. */
	busy: boolean
	open: boolean
	addDisabled: boolean
	/** What the add button would capture, named for the button's tooltip. */
	addTitle: string
	onToggle: () => void
	onAdd: () => void
	onOpen: (page: PageSnapshot) => void
	onRemove: (page: PageSnapshot) => void
}) {
	// A date is only shown for a capture on another day, so this only has to be "now" and
	// is read once per render — it is not a state change anyone can observe.
	const reference = Date.now()
	const count = pages.length
	const waiting = pages.filter((page) => !page.messageId).length
	const summary = `${count} page${count === 1 ? '' : 's'} in this chat`
	// Name the waiting pages only when some of them are already in a turn; otherwise the
	// count alone says it.
	const description = busy
		? `${summary}, adding a page`
		: waiting > 0 && waiting < count
			? `${summary}, ${waiting} waiting for a turn`
			: summary

	return (
		<div className={`page-list${open && count > 0 ? ' page-list--open' : ''}`}>
			<div className="page-list__head">
				{count === 0 ? (
					<span
						className={`page-list__caption page-list__caption--empty${busy ? ' page-list__capturing' : ''}`}
					>
						{busy ? ADDING_PAGE : NO_PAGES}
					</span>
				) : (
					<button
						type="button"
						className="page-list__toggle"
						onClick={onToggle}
						aria-expanded={open}
						aria-controls={open ? PAGE_LIST_ID : undefined}
						aria-label={description}
						title={open ? 'Hide pages' : 'Show pages'}
					>
						{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
						<span className={`page-list__caption${busy ? ' page-list__capturing' : ''}`}>
							<span className="page-list__count">{count}</span>{' '}
							<span className="page-list__label">{count === 1 ? 'page' : 'pages'}</span>
						</span>
					</button>
				)}
				<button
					type="button"
					className="button button--ghost button--sm page-list__add"
					onClick={onAdd}
					disabled={addDisabled}
					title={addTitle}
					aria-label="Add page to chat"
				>
					Add page
				</button>
			</div>

			{open && count > 0 && (
				<ol className="page-list__panel" id={PAGE_LIST_ID} aria-label="Pages in this chat">
					{pages.map((page) => {
						const title = page.title || hostOf(page.url)
						const pending = !page.messageId
						const stamp = stampTime(page.capturedAt, reference)
						const tooltip = stampTooltip(page.capturedAt)
						return (
							<li
								key={page.id}
								className={`page-list__item${pending ? ' page-list__item--pending' : ''}`}
							>
								<button
									type="button"
									className="page-chip page-chip--list"
									onClick={() => onOpen(page)}
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
									{/* `dateTime` is the machine-readable instant; the tooltip spells it out in the
							    user's own locale, so the row is never the only thing a reader gets. */}
									<time
										className="page-chip__stamp"
										dateTime={stampIso(page.capturedAt)}
										title={tooltip}
									>
										{stamp}
									</time>
									<span className="page-chip__host">{hostOf(page.url)}</span>
								</button>
								{pending && (
									<button
										type="button"
										className="page-list__remove"
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
	)
}
