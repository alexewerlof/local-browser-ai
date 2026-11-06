import { FileText } from 'lucide-react'
import type { PageSnapshot } from '../../core/types'

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return url
	}
}

/**
 * The pages of the chat, one chip each, inside the composer's top bar.
 *
 * The strip never wraps: it scrolls horizontally so a chat with several pages cannot
 * eat the space the prompt needs. The title is ellipsised and the full URL is the
 * tooltip, exactly like the card in the transcript.
 */
export function PageList({
	pages,
	busy,
	onOpen,
}: {
	pages: PageSnapshot[]
	busy: boolean
	onOpen: (page: PageSnapshot) => void
}) {
	if (pages.length === 0) {
		return (
			<span className="page-list page-list--empty">
				{/* The context menu is the only way in, so the empty strip has to say so. */}
				{busy ? 'Adding the page…' : 'Right-click a page → Add this page to chat'}
			</span>
		)
	}

	return (
		<div className="page-list" role="list" aria-label="Pages in this chat">
			{pages.map((page) => (
				<button
					key={page.id}
					type="button"
					role="listitem"
					className={`page-chip${page.messageId ? ' page-chip--sent' : ''}`}
					onClick={() => onOpen(page)}
					title={page.url}
					aria-label={`Open ${page.title || hostOf(page.url)} — ${page.url}`}
				>
					{page.faviconUrl ? (
						<img className="page-chip__icon" src={page.faviconUrl} alt="" width={12} height={12} />
					) : (
						<FileText size={12} />
					)}
					<span className="page-chip__title">{page.title || hostOf(page.url)}</span>
				</button>
			))}
		</div>
	)
}
