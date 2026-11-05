import { MessageSquarePlus, MessagesSquare, Settings } from 'lucide-react'
import type { Conversation } from '../../core/types'
import { openSettings } from '../../platform/chrome'

export function Header({
	conversation,
	onNew,
	onHistory,
}: {
	conversation: Conversation
	onNew: () => void
	onHistory: () => void
}) {
	return (
		<header className="header">
			<span className="header__title" title={conversation.title}>
				{conversation.title}
			</span>
			<button
				type="button"
				className="button button--ghost button--icon button--sm"
				onClick={onNew}
				title="New chat"
				aria-label="New chat"
			>
				<MessageSquarePlus size={15} />
			</button>
			<button
				type="button"
				className="button button--ghost button--icon button--sm"
				onClick={onHistory}
				title="Chat history"
				aria-label="Chat history"
			>
				<MessagesSquare size={15} />
			</button>
			<button
				type="button"
				className="button button--ghost button--icon button--sm"
				onClick={() => void openSettings()}
				title="Settings"
				aria-label="Settings"
			>
				<Settings size={15} />
			</button>
		</header>
	)
}
