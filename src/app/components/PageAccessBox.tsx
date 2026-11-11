import { TriangleAlert, X } from 'lucide-react'
import { PAGE_ACCESS_LABELS } from '../../core/page-access'

/**
 * The grant question above the composer: what may be read, and the two ways to answer.
 *
 * It is a sentence and a row of actions rather than a one-line bar, because the choice it
 * asks for is not one-click: the permanent grant is a site-wide decision the user should
 * read before making, and the one-page route is a different gesture in a different place.
 * The actions therefore sit under the sentence, at its own left edge, instead of floating
 * beside it in a panel this narrow.
 *
 * Dismissing (the X) is the same decision as Cancel: both go through `cancelPageAccess`,
 * so neither can drift from the other. Continue is the primary action only when the
 * permanent grant is the recommended route, which is the search case alone.
 */
export function PageAccessBox({
	message,
	recommendPermanent,
	onContinue,
	onCancel,
}: {
	message: string
	/** Render Continue as the primary button: the permanent grant is what this box wants. */
	recommendPermanent: boolean
	onContinue: () => void
	onCancel: () => void
}) {
	return (
		<div className="page-access">
			<TriangleAlert size={18} className="page-access__icon" />
			<div className="page-access__body">
				<p className="page-access__text">{message}</p>
				<div className="page-access__actions">
					<button
						type="button"
						className={`button button--sm${recommendPermanent ? ' button--primary' : ''}`}
						onClick={onContinue}
					>
						{PAGE_ACCESS_LABELS.continue}
					</button>
					<button type="button" className="button button--ghost button--sm" onClick={onCancel}>
						{PAGE_ACCESS_LABELS.cancel}
					</button>
				</div>
			</div>
			<button
				type="button"
				className="button button--ghost button--icon button--sm page-access__close"
				onClick={onCancel}
				title="Dismiss"
				aria-label="Dismiss the page request"
			>
				<X size={13} />
			</button>
		</div>
	)
}
