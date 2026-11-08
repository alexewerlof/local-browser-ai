import { FileText, Trash2 } from 'lucide-react'
import type { PageSnapshot } from '../../core/types'

/** The id the count points at while the list is open (`aria-controls`). */
const PAGE_LIST_ID = 'page-list-pages'

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return url
	}
}

/**
 * The pages, one row each, directly above the composer box. The composer is anchored to
 * the bottom of the panel, so opening this list pushes the transcript up and leaves both
 * the count and the prompt where they were. The cap keeps a very long list scrolling
 * instead of swallowing the panel.
 *
 * A page that has not reached a turn yet is dimmed and carries a trash can: its block is
 * not in any request, so it can still be taken back. Once a turn carries it the page is
 * part of the transcript and only stays openable.
 */
export function PageList({
	pages,
	onOpen,
	onRemove,
}: {
	pages: PageSnapshot[]
	onOpen: (page: PageSnapshot) => void
	onRemove: (page: PageSnapshot) => void
}) {
	return (
		<ol className="page-list__panel" id={PAGE_LIST_ID} aria-label="Pages in this chat">
			{pages.map((page) => {
				const title = page.title || hostOf(page.url)
				const pending = !page.messageId
				return (
					<li key={page.id} className={`page-list__item${pending ? ' page-list__item--pending' : ''}`}>
						<button
							type="button"
							className="page-chip page-chip--list"
							onClick={() => onOpen(page)}
							title={page.url}
							aria-label={`Open ${title} — ${page.url}`}
						>
							{page.faviconUrl ? (
								<img className="page-chip__icon" src={page.faviconUrl} alt="" width={12} height={12} />
							) : (
								<FileText size={12} />
							)}
							<span className="page-chip__title">{title}</span>
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
	)
}

/**
 * The strip inside the composer's top bar, in two states: a hint when the chat has no
 * pages, and a page count — the page icon and the number, as a ghost button — when it
 * has one or more. One control looks the same however many pages the chat holds.
 *
 * The count opens and closes the list above the box. While a page is being captured and
 * converted it pulses, so a slow page reads as work in progress; once the page is in the
 * chat the icon sits still, because waiting for a turn is not something to watch.
 */
export function PageListToggle({
	pages,
	busy,
	open,
	onToggle,
}: {
	pages: PageSnapshot[]
	busy: boolean
	open: boolean
	onToggle: () => void
}) {
	if (pages.length === 0) {
		return (
			<span className="page-list page-list--empty">
				{/* Both ways in are worth naming: the button is easy to miss in a narrow panel. */}
				<span className="page-list__hint">
					{busy ? 'Adding the page…' : 'Press + for this page, or right-click → Add to chat'}
				</span>
			</span>
		)
	}

	const waiting = pages.filter((page) => !page.messageId).length
	const count = `${pages.length} page${pages.length === 1 ? '' : 's'} in this chat`
	// Name the waiting pages only when some of them are already in a turn; otherwise the
	// count alone says it.
	const label = busy
		? `${count}, adding a page`
		: waiting > 0 && waiting < pages.length
			? `${count}, ${waiting} waiting for a turn`
			: count

	return (
		<div className="page-list">
			<button
				type="button"
				className="button button--ghost button--sm page-list__toggle"
				onClick={onToggle}
				aria-expanded={open}
				aria-controls={open ? PAGE_LIST_ID : undefined}
				aria-label={label}
				title={open ? 'Hide pages' : 'Show pages'}
			>
				<FileText size={13} className={`page-list__icon${busy ? ' page-list__capturing' : ''}`} />
				{pages.length}
			</button>
		</div>
	)
}
