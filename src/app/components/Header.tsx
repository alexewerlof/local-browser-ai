import type { Conversation } from '../../core/types'
import { getManifest, openOptionsPage } from '../../platform/chrome'
import { Icon } from './Icon'

export function Header({
	conversation,
	onNew,
	onHistory,
}: {
	conversation: Conversation
	onNew: () => void
	onHistory: () => void
}) {
	const manifest = getManifest()
	return (
		<header className="header">
			<img className="header__logo" src="./images/icon-32.png" alt="" width={18} height={18} />
			<div className="header__text">
				<span className="header__name">{manifest.name}</span>
				<span className="header__title" title={conversation.title}>
					{conversation.title}
				</span>
			</div>
			<span className="spacer" />
			<button
				type="button"
				className="button button--ghost button--icon button--sm"
				onClick={onNew}
				title="New chat"
				aria-label="New chat"
			>
				<Icon name="plus" size={15} />
			</button>
			<button
				type="button"
				className="button button--ghost button--icon button--sm"
				onClick={onHistory}
				title="Chat history"
				aria-label="Chat history"
			>
				<Icon name="history" size={15} />
			</button>
			<button
				type="button"
				className="button button--ghost button--icon button--sm"
				onClick={() => void openOptionsPage()}
				title="Settings"
				aria-label="Settings"
			>
				<Icon name="settings" size={15} />
			</button>
		</header>
	)
}
