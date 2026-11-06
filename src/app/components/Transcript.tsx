import { useEffect, useRef } from 'react'
import { Download, Sparkles } from 'lucide-react'
import type { AppSettings, Conversation, PageSnapshot } from '../../core/types'
import { setDraft } from '../../state/composer'
import { preparePromptModel, downloadProgressStore, promptStatusStore } from '../../state/prompt'
import { useStore } from '../useStore'
import { EXAMPLE_PROMPTS } from '../examples'
import { MessageItem, StreamingStats } from './MessageItem'
import type { RunState } from '../../state/chat'

export function Transcript({
	conversation,
	settings,
	pages,
	run,
	onRegenerate,
	onOpenPage,
}: {
	conversation: Conversation
	settings: AppSettings
	pages: PageSnapshot[]
	run: RunState
	onRegenerate: () => void
	onOpenPage: (page: PageSnapshot) => void
}) {
	const scrollerRef = useRef<HTMLDivElement>(null)
	const stickRef = useRef(true)
	const lastMessage = conversation.messages[conversation.messages.length - 1]

	useEffect(() => {
		if (!stickRef.current) return
		const element = scrollerRef.current
		if (element) element.scrollTop = element.scrollHeight
	})

	const handleScroll = () => {
		const element = scrollerRef.current
		if (!element) return
		stickRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96
	}

	const lastAssistantIndex = findLastIndex(conversation.messages, (message) => message.role === 'assistant')

	return (
		<div ref={scrollerRef} className="transcript" onScroll={handleScroll}>
			{conversation.messages.length === 0 ? (
				<EmptyState hasPages={pages.length > 0} />
			) : (
				conversation.messages.map((message, index) => (
					<MessageItem
						key={message.id}
						message={message}
						settings={settings}
						conversationId={conversation.id}
						pages={pages}
						isLast={index === conversation.messages.length - 1}
						canRegenerate={
							index === lastAssistantIndex &&
							run.status === 'idle' &&
							message.status !== 'streaming' &&
							index > 0
						}
						onRegenerate={onRegenerate}
						onOpenPage={onOpenPage}
					/>
				))
			)}

			{lastMessage?.status === 'complete' && run.finishedAt && (
				<div className="transcript__stats">
					<StreamingStats
						startedAt={run.startedAt}
						firstTokenAt={run.firstTokenAt}
						finishedAt={run.finishedAt}
						outputTokens={run.outputTokens}
					/>
				</div>
			)}
			<div className="transcript__spacer" />
		</div>
	)
}

function EmptyState({ hasPages }: { hasPages: boolean }) {
	const promptStatus = useStore(promptStatusStore)
	const downloadProgress = useStore(downloadProgressStore)
	const needsDownload = promptStatus?.availability === 'downloadable'

	return (
		<div className="empty">
			<div className="empty__mark">
				<Sparkles size={22} />
			</div>
			<h1 className="empty__title">{hasPages ? 'Ask about these pages' : 'What are you reading?'}</h1>
			<p className="empty__subtitle">
				{hasPages
					? 'The pages are in your context. Ask anything, or pick a starting point.'
					: 'Right-click any page and choose “Add to chat”, then ask. You can also just chat.'}
			</p>

			{needsDownload && (
				<div className="empty__download card">
					<div>
						<strong>Give the built-in model a moment</strong>
						<p className="hint">It downloads once, then runs entirely on this device.</p>
					</div>
					{downloadProgress === null ? (
						<button
							type="button"
							className="button button--primary"
							onClick={() => void preparePromptModel()}
						>
							<Download size={14} />
							Download model
						</button>
					) : (
						<div className="empty__progress">
							<progress value={downloadProgress} max={1} />
							<span className="hint">{Math.round(downloadProgress * 100)}%</span>
						</div>
					)}
				</div>
			)}

			<div className="empty__examples">
				{EXAMPLE_PROMPTS.map((prompt) => (
					<button key={prompt} type="button" className="empty__example" onClick={() => setDraft(prompt)}>
						{prompt}
					</button>
				))}
			</div>
		</div>
	)
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
	for (let index = items.length - 1; index >= 0; index -= 1) {
		const item = items[index]
		if (item !== undefined && predicate(item)) return index
	}
	return -1
}
