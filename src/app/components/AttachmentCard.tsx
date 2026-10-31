import { formatBytes } from '../../core/util'
import type { PageAttachment } from '../../core/types'
import { Icon } from './Icon'

export function AttachmentCard({
	attachment,
	busy,
	onRefresh,
	onRemove,
}: {
	attachment: PageAttachment
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
				<Icon name="page" size={14} />
			)}
			<div className="attachment__text">
				<span className="attachment__title">{attachment.title || host}</span>
				<span className="attachment__meta">
					{host} · {formatBytes(attachment.totalChars)} · {attachment.outline.length} headings
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
				<Icon name="refresh" size={13} />
			</button>
			<button
				type="button"
				className="button button--ghost button--icon button--sm"
				onClick={onRemove}
				title="Detach the page"
				aria-label="Detach the page"
			>
				<Icon name="close" size={13} />
			</button>
		</div>
	)
}
