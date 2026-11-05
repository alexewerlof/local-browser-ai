import { useMemo, useState } from 'react'
import { Check, Copy, GraduationCap, MemoryStick, RefreshCw, TriangleAlert } from 'lucide-react'
import type { ChatMessage } from '../../core/types'
import { describeModel } from '../../core/settings'
import type { AppSettings } from '../../core/types'
import { formatDuration, formatTokens } from '../../core/util'
import { MEMORY_MAX_TEXT } from '../../core/memory'
import { saveMemory } from '../../state/memory'
import { Markdown } from './Markdown'
import { ReasoningBlock } from './ReasoningBlock'
import { ToolCallCard } from './ToolCallCard'

export function MessageItem({
	message,
	settings,
	conversationId,
	isLast,
	canRegenerate,
	onRegenerate,
}: {
	message: ChatMessage
	settings: AppSettings
	conversationId: string
	isLast: boolean
	canRegenerate: boolean
	onRegenerate: () => void
}) {
	const [copied, setCopied] = useState(false)
	const streaming = message.status === 'streaming'

	const plainText = useMemo(
		() =>
			message.parts
				.filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
				.map((part) => part.text)
				.join('\n\n'),
		[message.parts],
	)

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(plainText)
			setCopied(true)
			setTimeout(() => setCopied(false), 1200)
		} catch {
			// Clipboard permission can be denied; nothing useful to show.
		}
	}

	if (message.role === 'user') {
		const skill = message.skillId ? settings.skills.find((entry) => entry.id === message.skillId) : undefined
		return (
			<article className="message message--user">
				<div className="message__bubble">
					{skill && (
						<div className="message__skill">
							<GraduationCap size={12} />
							{skill.name}
						</div>
					)}
					<div className="message__text">{plainText}</div>
				</div>
				{settings.memory.enabled && plainText && (
					<div className="message__actions">
						<SaveMemoryButton text={plainText} conversationId={conversationId} messageId={message.id} />
					</div>
				)}
			</article>
		)
	}

	const usage = message.usage
	const modelLabel = message.model ? describeModel(settings, message.model) : ''
	const hasError = message.parts.some((part) => part.type === 'error')

	return (
		<article className={`message message--assistant${isLast ? ' message--last' : ''}`}>
			<div className="message__body">
				{message.parts.map((part, index) => {
					switch (part.type) {
						case 'reasoning':
							return (
								<ReasoningBlock
									key={`reasoning-${index}`}
									part={part}
									streaming={streaming && index === message.parts.length - 1}
								/>
							)
						case 'text':
							return (
								<Markdown
									key={`text-${index}`}
									text={part.text}
									streaming={streaming}
									math={settings.rendering.math}
									codeHighlighting={settings.rendering.codeHighlighting}
								/>
							)
						case 'tool-call':
							return <ToolCallCard key={part.toolCallId} part={part} />
						case 'error':
							return (
								<div className="message__error" key={`error-${index}`}>
									<TriangleAlert size={14} />
									<div>
										<strong>{part.message}</strong>
										{part.retryable && <span className="faint"> This may be temporary.</span>}
									</div>
								</div>
							)
						default:
							return null
					}
				})}

				{streaming && message.parts.length === 0 && (
					<div className="typing" aria-label="The model is responding">
						<span />
						<span />
						<span />
					</div>
				)}
			</div>

			{!streaming && (plainText || hasError) && (
				<footer className="message__footer">
					{message.status === 'aborted' && <span className="badge">stopped</span>}
					{modelLabel && <span className="faint">{modelLabel}</span>}
					{usage && (
						<span className="faint" title="input tokens used in the last step">
							{formatTokens(usage.inputTokens)} in / {formatTokens(usage.outputTokens)} out
						</span>
					)}
					<span className="spacer" />
					{plainText && settings.memory.enabled && !streaming && (
						<SaveMemoryButton text={plainText} conversationId={conversationId} messageId={message.id} />
					)}
					{plainText && (
						<button
							type="button"
							className="button button--ghost button--icon button--sm"
							onClick={() => void copy()}
							title="Copy answer"
							aria-label="Copy answer"
						>
							{copied ? <Check size={13} /> : <Copy size={13} />}
						</button>
					)}
					{canRegenerate && (
						<button
							type="button"
							className="button button--ghost button--sm"
							onClick={onRegenerate}
							title="Generate this answer again"
						>
							<RefreshCw size={13} />
							Retry
						</button>
					)}
				</footer>
			)}
		</article>
	)
}

/**
 * Save a message to memory in one click. It saves as `auto`, never `always`: promoting a
 * memory to always-on is the user's decision, made in Settings.
 */
function SaveMemoryButton({
	text,
	conversationId,
	messageId,
}: {
	text: string
	conversationId: string
	messageId: string
}) {
	const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'duplicate' | 'error'>('idle')

	const save = async () => {
		if (state !== 'idle' && state !== 'error') return
		setState('saving')
		const result = await saveMemory({
			text,
			mode: 'auto',
			source: { conversationId, messageId },
		})
		if (!result.ok) {
			setState('error')
			return
		}
		setState(result.action === 'unchanged' ? 'duplicate' : 'saved')
	}

	const done = state === 'saved' || state === 'duplicate'
	const label =
		state === 'saving'
			? 'Saving to memory…'
			: state === 'saved'
				? 'Saved to memory'
				: state === 'duplicate'
					? 'Already in memory'
					: state === 'error'
						? 'Could not save to memory'
						: 'Save to memory'

	// Silently truncating a long message would save something the user did not write.
	if (text.length > MEMORY_MAX_TEXT) {
		return (
			<button
				type="button"
				className="button button--ghost button--icon button--sm message__memory"
				disabled
				title={`Too long to save as one memory (${MEMORY_MAX_TEXT} characters max)`}
				aria-label="Too long to save as one memory"
			>
				<MemoryStick size={13} />
			</button>
		)
	}

	return (
		<button
			type="button"
			className="button button--ghost button--icon button--sm message__memory"
			onClick={() => void save()}
			disabled={state === 'saving' || done}
			title={label}
			aria-label={label}
		>
			{done ? <Check size={13} /> : <MemoryStick size={13} />}
		</button>
	)
}

export function StreamingStats({
	startedAt,
	firstTokenAt,
	finishedAt,
	outputTokens,
}: {
	startedAt?: number
	firstTokenAt?: number
	finishedAt?: number
	outputTokens?: number
}) {
	if (!startedAt) return null
	const end = finishedAt ?? Date.now()
	const total = end - startedAt
	const ttft = firstTokenAt ? firstTokenAt - startedAt : undefined
	const tps = outputTokens && total > 0 ? Math.round((outputTokens / total) * 1000) : undefined
	return (
		<span className="faint">
			{formatDuration(total)}
			{ttft !== undefined ? ` · ttft ${formatDuration(ttft)}` : ''}
			{tps ? ` · ${tps} tok/s` : ''}
		</span>
	)
}
