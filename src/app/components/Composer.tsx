import { useEffect, useMemo, useRef, useState } from 'react'
import {
	ArrowUp,
	BookMarked,
	ListOrdered,
	PanelBottomClose,
	PanelBottomOpen,
	Play,
	Plus,
	Square,
	Trash2,
	TriangleAlert,
} from 'lucide-react'
import type {
	AppSettings,
	Conversation,
	ModelRef,
	PageSnapshot,
	QueuedPrompt,
	ThinkingSelection,
} from '../../core/types'
import type { ContextSnapshot, RunState } from '../../state/chat'
import { clearComposer, draftStore, promptTemplateStore, setDraft } from '../../state/composer'
import { queueStore, removeQueuedPrompt } from '../../state/queue'
import { lastPageAddedStore } from '../../state/pages'
import { updateSettings } from '../../state/settings'
import { estimateTokens } from '../../core/context/tokens'
import { thinkingForModel } from '../../core/settings'
import { formatTokens } from '../../core/util'
import { getModelInfo } from '../../providers/catalog'
import { ContextMeter } from './ContextMeter'
import { PageList, PageListToggle } from './PageList'
import { PromptTemplateMenu, ToolsMenu } from './ComposerMenus'
import { ModelPicker } from './ModelPicker'
import { ThinkingMenu } from './ThinkingMenu'
import { useStore } from '../useStore'
import type { TabInfo } from '../../browser/protocol'

/**
 * The controls inside the box that own their click. Everything else within the border is
 * prompt chrome, so clicking it hands focus to the textarea (see `focusPrompt`).
 */
const BOX_CONTROL_SELECTOR =
	'button, a, input, select, textarea, [contenteditable="true"], [role="button"], .popover, .slash'

export function Composer({
	settings,
	conversation,
	pages,
	activeTab,
	run,
	context,
	addPageBusy,
	addPageError,
	queuePaused,
	onSubmit,
	onStop,
	onContinue,
	onOpenPage,
	onRemovePage,
	onAddCurrentPage,
	onCompact,
	onModelChange,
}: {
	settings: AppSettings
	conversation: Conversation
	/** Pages in this chat, in the order they were added. */
	pages: PageSnapshot[]
	/** The tab on screen, which the add button would capture. Null when it cannot be read. */
	activeTab: TabInfo | null
	run: RunState
	context: ContextSnapshot
	addPageBusy: boolean
	addPageError: string | null
	/** True when the user stopped the loop with prompts still queued. */
	queuePaused: boolean
	onSubmit: (text: string, promptTemplateId?: string) => void
	onStop: () => void
	onContinue: () => void
	onOpenPage: (page: PageSnapshot) => void
	onRemovePage: (page: PageSnapshot) => void
	onAddCurrentPage: () => void
	onCompact: () => void
	onModelChange: (ref: ModelRef) => void
}) {
	const draft = useStore(draftStore)
	const activeTemplate = useStore(promptTemplateStore)
	const queue = useStore(queueStore)
	const lastPageAdded = useStore(lastPageAddedStore)
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const [slashOpen, setSlashOpen] = useState(false)
	/**
	 * The prompt gets more vertical space by growing the whole composer to most of the
	 * panel, so a sliver of the transcript stays visible. In-memory only: a reopened
	 * panel starts at the normal size.
	 */
	const [expanded, setExpanded] = useState(false)
	/**
	 * The page list opens above the box, so it costs the transcript room, never the prompt.
	 * It also opens by itself when a page joins the chat (see below); like `expanded` it is
	 * in-memory, so a reopened panel starts with it closed.
	 */
	const [pagesOpen, setPagesOpen] = useState(false)

	const hasPages = pages.length > 0
	const streaming = run.status === 'streaming'
	const busy = run.status !== 'idle'
	const modelRef = conversation.model ?? settings.defaultModel
	const provider = modelRef ? settings.providers.find((entry) => entry.id === modelRef.providerId) : undefined
	const info = provider && modelRef ? getModelInfo(modelRef.modelId) : undefined
	const draftTokens = useMemo(() => estimateTokens(draft), [draft])

	const slashQuery = draft.startsWith('/') && !draft.includes('\n') ? draft.slice(1).toLowerCase() : null
	const slashMatches =
		slashQuery === null
			? []
			: settings.promptTemplates.filter((template) => template.name.toLowerCase().includes(slashQuery))

	useEffect(() => {
		const textarea = textareaRef.current
		if (!textarea) return
		if (expanded) {
			// The box flex-fills the expanded composer, so the textarea scrolls inside it
			// instead of growing past the available height.
			textarea.style.height = ''
			return
		}
		textarea.style.height = '0px'
		textarea.style.height = `${Math.min(240, Math.max(40, textarea.scrollHeight))}px`
	}, [draft, expanded])

	useEffect(() => {
		setSlashOpen(slashQuery !== null && slashMatches.length > 0)
	}, [slashQuery, slashMatches.length])

	// The list belongs to the chat that opened it: switching chats closes it.
	useEffect(() => {
		setPagesOpen(false)
	}, [conversation.id])

	// A page that just joined opens the list: a changing count is too quiet a signal, and
	// the row is one click from the trash can if the add was a mistake. A restored chat
	// appends nothing, so reopening the panel still starts with the list closed.
	useEffect(() => {
		if (lastPageAdded) setPagesOpen(true)
	}, [lastPageAdded])

	const submit = () => {
		const text = draftStore.get().trim()
		if (!text) return
		onSubmit(text, activeTemplate ?? undefined)
		clearComposer()
		setSlashOpen(false)
	}

	/**
	 * Pull a queued prompt back into the composer instead of deleting it: the user typed
	 * it already, so it replaces the draft and stays editable.
	 */
	const editQueued = async (item: QueuedPrompt) => {
		const removed = await removeQueuedPrompt(conversation.id, item.id)
		if (!removed) return
		setDraft(removed.text)
		promptTemplateStore.set(removed.promptTemplateId ?? null)
		setSlashOpen(false)
		// After React has written the new value, focus and put the caret at the end.
		requestAnimationFrame(() => {
			const textarea = textareaRef.current
			if (!textarea) return
			textarea.focus()
			const end = textarea.value.length
			textarea.setSelectionRange(end, end)
		})
	}

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Escape') {
			setSlashOpen(false)
			return
		}
		if (event.key !== 'Enter') return
		const wantsSubmit = settings.ui.submitKey === 'mod+enter' ? event.metaKey || event.ctrlKey : !event.shiftKey
		if (!wantsSubmit) return
		event.preventDefault()
		submit()
	}

	/**
	 * The border is the prompt editor, so a click on its own chrome — the space beside the
	 * topbar buttons, the gap after the last chip — focuses the textarea. Clicking a
	 * non-focusable element would otherwise drop the caret to <body>, which is why only the
	 * text itself used to work. A control keeps its own click; the popover and the slash
	 * menu are excluded because their padding is menu surface, not prompt chrome.
	 */
	const focusPrompt = (event: React.MouseEvent<HTMLDivElement>) => {
		if (event.button !== 0 || event.defaultPrevented) return
		if ((event.target as HTMLElement).closest(BOX_CONTROL_SELECTOR)) return
		// Keep focus where it is instead of letting it fall to <body> and back.
		event.preventDefault()
		const textarea = textareaRef.current
		if (!textarea || document.activeElement === textarea) return
		textarea.focus()
		// The click was not about placing the caret, so put it after the existing text.
		const end = textarea.value.length
		textarea.setSelectionRange(end, end)
	}

	const applyTemplate = (promptTemplateId: string) => {
		const template = settings.promptTemplates.find((entry) => entry.id === promptTemplateId)
		if (!template) return
		promptTemplateStore.set(template.id)
		setDraft(template.prompt)
		setSlashOpen(false)
		textareaRef.current?.focus()
	}

	const setThinking = (thinking: ThinkingSelection) => {
		if (!modelRef) return
		// The chip is about the model on screen, so the choice is stored on that model
		// rather than changing every model's default.
		updateSettings((current) => ({
			...current,
			providers: current.providers.map((entry) =>
				entry.id === modelRef.providerId
					? {
							...entry,
							modelThinking: { ...(entry.modelThinking ?? {}), [modelRef.modelId]: thinking },
						}
					: entry,
			),
		}))
	}

	return (
		<div className={`composer${expanded ? ' composer--expanded' : ''}`}>
			{addPageError && (
				<div className="composer__error">
					<TriangleAlert size={14} />
					<span>{addPageError}</span>
				</div>
			)}

			{queue.length > 0 && (
				<div className="composer__queue" role="region" aria-label="Queued prompts">
					<div className="composer__queue-label">
						<ListOrdered size={12} />
						<span>Queued · {queue.length}</span>
					</div>
					{queue.map((item) => {
						const template = item.promptTemplateId
							? settings.promptTemplates.find((entry) => entry.id === item.promptTemplateId)
							: undefined
						return (
							<div key={item.id} className="composer__queue-item">
								<button
									type="button"
									className="button button--ghost button--icon composer__queue-remove"
									onClick={() => void editQueued(item)}
									title="Remove from queue and edit"
									aria-label={`Remove queued prompt and edit: ${item.text.slice(0, 60)}`}
								>
									<Trash2 size={12} />
								</button>
								{template && <BookMarked size={12} className="composer__queue-template" />}
								<span className="composer__queue-text">{item.text}</span>
							</div>
						)
					})}
				</div>
			)}

			{pagesOpen && pages.length > 0 && <PageList pages={pages} onOpen={onOpenPage} onRemove={onRemovePage} />}

			<div className={`composer__box${streaming ? ' composer__box--streaming' : ''}`} onMouseDown={focusPrompt}>
				<div className="composer__topbar">
					<button
						type="button"
						className="button button--ghost button--icon button--sm composer__add-page"
						onClick={onAddCurrentPage}
						disabled={!activeTab || addPageBusy}
						title={
							activeTab
								? `Add “${activeTab.title}” to this chat`
								: 'Add the page you are reading to this chat'
						}
						aria-label="Add current page to chat"
					>
						<Plus size={14} />
					</button>
					<PageListToggle
						pages={pages}
						busy={addPageBusy}
						open={pagesOpen}
						onToggle={() => setPagesOpen((value) => !value)}
					/>
					<button
						type="button"
						className="button button--ghost button--icon button--sm"
						onClick={() => setExpanded((current) => !current)}
						title={expanded ? 'Shrink' : 'Expand'}
						aria-label={expanded ? 'Shrink' : 'Expand'}
						aria-expanded={expanded}
						aria-controls="composer-input"
					>
						{expanded ? <PanelBottomClose size={14} /> : <PanelBottomOpen size={14} />}
					</button>
				</div>

				{slashOpen && (
					<div className="slash">
						{slashMatches.map((template) => (
							<button
								key={template.id}
								type="button"
								className="slash__item"
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => applyTemplate(template.id)}
							>
								<BookMarked size={12} />
								<span>{template.name}</span>
								{template.description && <span className="faint">{template.description}</span>}
							</button>
						))}
					</div>
				)}

				<textarea
					ref={textareaRef}
					id="composer-input"
					className="composer__input"
					placeholder={
						busy
							? 'Queue another message…'
							: hasPages
								? 'Ask about these pages…'
								: 'Ask anything, or type / for a template'
					}
					value={draft}
					rows={1}
					onChange={(event) => {
						setDraft(event.target.value)
						if (!event.target.value.trim()) promptTemplateStore.set(null)
					}}
					onKeyDown={handleKeyDown}
					aria-label="Message"
				/>

				<div className="composer__toolbar">
					<PromptTemplateMenu
						templates={settings.promptTemplates}
						onSelect={(template) => {
							promptTemplateStore.set(template.id)
							setDraft(template.prompt)
							textareaRef.current?.focus()
						}}
					/>

					<ToolsMenu
						settings={settings}
						onChange={(tools) => updateSettings((current) => ({ ...current, tools }))}
					/>

					<ModelPicker settings={settings} current={modelRef} onSelect={onModelChange} />

					{info && provider && modelRef && (
						<ThinkingMenu
							info={info}
							value={thinkingForModel(provider, modelRef.modelId)}
							onChange={setThinking}
						/>
					)}

					<span className="spacer" />

					{streaming && (
						<button
							type="button"
							className="button button--icon button--sm"
							onClick={onStop}
							title="Stop generating"
							aria-label="Stop generating"
						>
							<Square size={13} />
						</button>
					)}

					{/* Stop parks the queue; this is how the user restarts it. */}
					{queuePaused && queue.length > 0 && !busy && (
						<button
							type="button"
							className="button button--icon button--sm"
							onClick={onContinue}
							title="Continue queued prompts"
							aria-label="Continue"
						>
							<Play size={13} />
						</button>
					)}

					{/* Rendered once there is something to send: it sends when idle and queues while the agent works. */}
					{draft.trim() !== '' && (
						<button
							type="button"
							className="button button--primary button--icon button--sm composer__submit"
							onClick={submit}
							title={busy ? 'Queue prompt' : 'Submit'}
							aria-label="Submit"
						>
							<ArrowUp size={14} />
						</button>
					)}
				</div>
			</div>

			<div className="composer__meta">
				<ContextMeter snapshot={context} busy={busy} onCompact={onCompact} />
				<span className="composer__count faint">
					{draft
						? `${formatTokens(draftTokens)} tok`
						: `${settings.ui.submitKey === 'enter' ? 'Enter' : '⌘↵'} to submit`}
				</span>
			</div>
		</div>
	)
}
