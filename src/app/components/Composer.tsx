import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, RefreshCw, Send, Sparkles, Square, TriangleAlert } from 'lucide-react'
import type { AppSettings, Conversation, ModelRef, ThinkingSelection } from '../../core/types'
import type { ContextSnapshot, RunState } from '../../state/chat'
import { clearComposer, draftStore, setDraft, skillStore } from '../../state/composer'
import { updateSettings } from '../../state/settings'
import { estimateTokens } from '../../core/context/tokens'
import { formatTokens } from '../../core/util'
import { getModelInfo } from '../../providers/catalog'
import { AttachmentCard } from './AttachmentCard'
import { ContextMeter } from './ContextMeter'
import { SkillMenu, ToolsMenu } from './ComposerMenus'
import { ModelPicker } from './ModelPicker'
import { ThinkingMenu } from './ThinkingMenu'
import { useStore } from '../useStore'

export function Composer({
	settings,
	conversation,
	run,
	context,
	attachBusy,
	attachError,
	onSend,
	onStop,
	onAttach,
	onRefreshAttachment,
	onRemoveAttachment,
	onCompact,
	onModelChange,
}: {
	settings: AppSettings
	conversation: Conversation
	run: RunState
	context: ContextSnapshot
	attachBusy: boolean
	attachError: string | null
	onSend: (text: string, skillId?: string) => void
	onStop: () => void
	onAttach: () => void
	onRefreshAttachment: () => void
	onRemoveAttachment: () => void
	onCompact: () => void
	onModelChange: (ref: ModelRef) => void
}) {
	const draft = useStore(draftStore)
	const activeSkill = useStore(skillStore)
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const [slashOpen, setSlashOpen] = useState(false)

	const attachment = conversation.attachments[0]
	const streaming = run.status === 'streaming'
	const busy = run.status !== 'idle'
	const modelRef = conversation.model ?? settings.defaultModel
	const provider = modelRef ? settings.providers.find((entry) => entry.id === modelRef.providerId) : undefined
	const info = provider && modelRef ? getModelInfo(provider.kind, modelRef.modelId) : undefined
	const draftTokens = useMemo(() => estimateTokens(draft), [draft])

	const slashQuery = draft.startsWith('/') && !draft.includes('\n') ? draft.slice(1).toLowerCase() : null
	const slashMatches =
		slashQuery === null ? [] : settings.skills.filter((skill) => skill.name.toLowerCase().includes(slashQuery))

	useEffect(() => {
		const textarea = textareaRef.current
		if (!textarea) return
		textarea.style.height = '0px'
		textarea.style.height = `${Math.min(240, Math.max(40, textarea.scrollHeight))}px`
	}, [draft])

	useEffect(() => {
		setSlashOpen(slashQuery !== null && slashMatches.length > 0)
	}, [slashQuery, slashMatches.length])

	const submit = () => {
		const text = draftStore.get().trim()
		if (!text || busy) return
		onSend(text, activeSkill ?? undefined)
		clearComposer()
		setSlashOpen(false)
	}

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Escape') {
			setSlashOpen(false)
			return
		}
		if (event.key !== 'Enter') return
		const wantsSend = settings.ui.sendKey === 'mod+enter' ? event.metaKey || event.ctrlKey : !event.shiftKey
		if (!wantsSend) return
		event.preventDefault()
		submit()
	}

	const applySkill = (skillId: string) => {
		const skill = settings.skills.find((entry) => entry.id === skillId)
		if (!skill) return
		skillStore.set(skill.id)
		setDraft(skill.prompt)
		setSlashOpen(false)
		textareaRef.current?.focus()
	}

	const setThinking = (thinking: ThinkingSelection) => {
		updateSettings((current) => ({
			...current,
			modelDefaults: { ...current.modelDefaults, thinking },
		}))
	}

	return (
		<div className="composer">
			{attachment && (
				<AttachmentCard
					attachment={attachment}
					busy={attachBusy}
					onRefresh={onRefreshAttachment}
					onRemove={onRemoveAttachment}
				/>
			)}

			{attachError && (
				<div className="composer__error">
					<TriangleAlert size={14} />
					<span>{attachError}</span>
				</div>
			)}

			<div className={`composer__box${streaming ? ' composer__box--streaming' : ''}`}>
				{slashOpen && (
					<div className="slash">
						{slashMatches.map((skill) => (
							<button
								key={skill.id}
								type="button"
								className="slash__item"
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => applySkill(skill.id)}
							>
								<Sparkles size={12} />
								<span>{skill.name}</span>
								{skill.description && <span className="faint">{skill.description}</span>}
							</button>
						))}
					</div>
				)}

				<textarea
					ref={textareaRef}
					className="composer__input"
					placeholder={attachment ? 'Ask about this page…' : 'Ask anything, or type / for a skill'}
					value={draft}
					rows={1}
					onChange={(event) => {
						setDraft(event.target.value)
						if (!event.target.value.trim()) skillStore.set(null)
					}}
					onKeyDown={handleKeyDown}
					aria-label="Message"
				/>

				<div className="composer__toolbar">
					<button
						type="button"
						className="chip chip--icon"
						onClick={attachment ? onRefreshAttachment : onAttach}
						disabled={attachBusy}
						title={attachment ? 'Re-read the page' : 'Attach the current tab'}
					>
						{attachment ? <RefreshCw size={13} /> : <FileText size={13} />}
					</button>

					<SkillMenu
						skills={settings.skills}
						onSelect={(skill) => {
							skillStore.set(skill.id)
							setDraft(skill.prompt)
							textareaRef.current?.focus()
						}}
					/>

					<ToolsMenu
						settings={settings}
						onChange={(enabled) =>
							updateSettings((current) => ({
								...current,
								tools: { ...current.tools, enabled },
							}))
						}
						disabledReason={
							info && !info.capabilities.tools ? 'This model does not support tool calling.' : undefined
						}
					/>

					<ModelPicker settings={settings} current={modelRef} onSelect={onModelChange} />

					{info && provider && modelRef && (
						<ThinkingMenu
							kind={provider.kind}
							info={info}
							value={settings.modelDefaults.thinking}
							onChange={setThinking}
						/>
					)}

					<span className="spacer" />

					{streaming ? (
						<button
							type="button"
							className="button button--icon"
							onClick={onStop}
							title="Stop generating"
							aria-label="Stop generating"
						>
							<Square size={13} />
						</button>
					) : (
						<button
							type="button"
							className="button button--primary button--icon"
							onClick={submit}
							disabled={!draft.trim() || busy}
							title="Send"
							aria-label="Send"
						>
							<Send size={14} />
						</button>
					)}
				</div>
			</div>

			<div className="composer__meta">
				<ContextMeter snapshot={context} busy={busy} onCompact={onCompact} />
				<span className="composer__count faint">
					{draft
						? `${formatTokens(draftTokens)} tok`
						: `${settings.ui.sendKey === 'enter' ? 'Enter' : '⌘↵'} to send`}
				</span>
			</div>
		</div>
	)
}
