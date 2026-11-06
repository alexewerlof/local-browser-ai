import { FileText, RefreshCw, X } from 'lucide-react'
import { formatBytes } from '../../core/util'
import type { PageSnapshot } from '../../core/types'

export function AttachmentCard({
	attachment,
	busy,
	onRefresh,
	onRemove,
}: {
	attachment: PageSnapshot
	busy: boolean
	onRefresh: () => void
	onRemove: () => void
}) {
	let host = attachment.url
	try {
		host = new URL(attachment.url).hostname.replace(/^www\./, '')
	} catch {
		// keep the raw URL
	}

	return (
		<div className="attachment" title={attachment.url}>
			{attachment.faviconUrl ? (
				<img className="attachment__icon" src={attachment.faviconUrl} alt="" width={14} height={14} />
			) : (
				<FileText size={14} />
			)}
			<div className="attachment__text">
				<span className="attachment__title">{attachment.title || host}</span>
				<span className="attachment__meta">
					{host} · {formatBytes(attachment.totalChars)} · {attachment.outline.length} headings
					{attachment.representation === 'app' ? ' · app view' : ''}
					{attachment.truncated ? ' · truncated' : ''}
				</span>
			</div>
			{attachment.stale && <span className="badge badge--danger">changed</span>}
			<button
				type="button"
				className="button button--ghost button--icon button--sm"
				onClick={onRefresh}
				disabled={busy}
				title="Re-read the page"
				aria-label="Re-read the page"
			>
				<RefreshCw size={13} />
			</button>
			<button
				type="button"
				className="button button--ghost button--icon button--sm"
				onClick={onRemove}
				title="Detach the page"
				aria-label="Detach the page"
			>
				<X size={13} />
			</button>
		</div>
	)
}
