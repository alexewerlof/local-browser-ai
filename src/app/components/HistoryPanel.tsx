import { useEffect, useState } from 'react'
import { MessagesSquare, Plus, Trash2, X } from 'lucide-react'
import { listConversations, type ConversationMeta } from '../../state/database'
import { relativeTime } from '../../core/util'

export function HistoryPanel({
	open,
	currentId,
	onClose,
	onOpen,
	onDelete,
	onNew,
}: {
	open: boolean
	currentId: string
	onClose: () => void
	onOpen: (id: string) => void
	onDelete: (id: string) => void
	onNew: () => void
}) {
	const [items, setItems] = useState<ConversationMeta[]>([])
	const [loading, setLoading] = useState(false)

	useEffect(() => {
		if (!open) return
		setLoading(true)
		void listConversations()
			.then(setItems)
			.finally(() => setLoading(false))
	}, [open])

	useEffect(() => {
		if (!open) return
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose()
		}
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [open, onClose])

	if (!open) return null

	return (
		<div className="drawer" role="dialog" aria-label="Chat history">
			<div className="drawer__backdrop" onClick={onClose} />
			<aside className="drawer__panel">
				<header className="drawer__header">
					<MessagesSquare size={14} className="drawer__icon" />
					<span className="label">Chats</span>
					<span className="spacer" />
					<button
						type="button"
						className="button button--ghost button--icon button--sm"
						onClick={() => {
							onNew()
							onClose()
						}}
						title="New chat"
					>
						<Plus size={14} />
					</button>
					<button
						type="button"
						className="button button--ghost button--icon button--sm"
						onClick={onClose}
						title="Close"
					>
						<X size={14} />
					</button>
				</header>

				<div className="drawer__list">
					{loading && <p className="drawer__empty">Loading…</p>}
					{!loading && items.length === 0 && <p className="drawer__empty">No saved chats yet.</p>}
					{items.map((item) => (
						<div key={item.id} className={`history${item.id === currentId ? ' history--current' : ''}`}>
							<button
								type="button"
								className="history__main"
								onClick={() => {
									onOpen(item.id)
									onClose()
								}}
							>
								<span className="history__icon">
									<MessagesSquare size={15} />
								</span>
								<span className="history__body">
									<span className="history__title">{item.title}</span>
									<span className="history__meta">
										{relativeTime(item.updatedAt)} · {item.messageCount} messages
									</span>
								</span>
							</button>
							<button
								type="button"
								className="button button--ghost button--icon button--sm history__delete"
								onClick={() => {
									onDelete(item.id)
									setItems((current) => current.filter((entry) => entry.id !== item.id))
								}}
								title="Delete chat"
							>
								<Trash2 size={13} />
							</button>
						</div>
					))}
				</div>
			</aside>
		</div>
	)
}
