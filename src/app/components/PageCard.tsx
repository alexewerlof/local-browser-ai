import { FileText } from 'lucide-react'
import type { PageSnapshot } from '../../core/types'
import { formatBytes, relativeTime } from '../../core/util'

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return url
	}
}

/**
 * One page in the chat. The title and URL form a single button: clicking brings the page
 * back on screen, reopening it when its tab is gone. Nothing here edits the page — a
 * snapshot is immutable once added, which is what keeps the earlier turns cacheable.
 */
export function PageCard({ page, onOpen }: { page: PageSnapshot; onOpen: (page: PageSnapshot) => void }) {
	const host = hostOf(page.url)
	return (
		<div className="page-card">
			<button
				type="button"
				className="page-card__link"
				onClick={() => onOpen(page)}
				title={page.url}
				aria-label={`Open ${page.title || host} — ${page.url}`}
			>
				{page.faviconUrl ? (
					<img className="page-card__icon" src={page.faviconUrl} alt="" width={14} height={14} />
				) : (
					<FileText size={14} />
				)}
				<span className="page-card__text">
					<span className="page-card__title">{page.title || host}</span>
					<span className="page-card__url">{page.url}</span>
				</span>
			</button>
			<span className="page-card__meta">
				{formatBytes(page.totalChars)} · {page.outline.length} headings
				{page.representation === 'app' ? ' · app view' : ''}
				{page.truncated ? ' · truncated' : ''}
				{/* The stamp tells two captures of one page apart. */}· {relativeTime(page.capturedAt)}
			</span>
		</div>
	)
}
