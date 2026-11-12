import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, BookMarked, ListOrdered, Play, Square, Trash2, TriangleAlert } from 'lucide-react'
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
import {
	DRAG_THRESHOLD,
	RESIZE_STEP,
	clampComposerHeight,
	composerHeightForChrome,
	composerHeightFromDrag,
	composerLimits,
	isResetGesture,
	type ComposerLimits,
} from '../composer-size'
import { ContextMeter } from './ContextMeter'
import { PageList } from './PageList'
import { PromptTemplateMenu, ToolsMenu } from './ComposerMenus'
import { ModelPicker } from './ModelPicker'
import { ThinkingMenu } from './ThinkingMenu'
import { useStore } from '../useStore'
import type { TabInfo } from '../../browser/protocol'

/**
 * The controls that own their click. Everything else is prompt chrome, so clicking it hands
 * focus to the textarea (see `focusPrompt`). The page header is a separate band of the
 * composer rather than prompt chrome, but it is not inside this element at all, so the
 * guard only has to name the controls that are.
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
	const composerRef = useRef<HTMLDivElement>(null)
	const [slashOpen, setSlashOpen] = useState(false)
	/**
	 * The height the user dragged the composer to, or `null` for the natural one the textarea's
	 * auto-grow produces. In-memory only: a reopened panel starts at the natural size, because
	 * a panel that opened half full of prompt would be a surprise.
	 */
	const [height, setHeight] = useState<number | null>(null)
	/** The two ends of the current gesture, for the line's own accessible value. */
	const [limits, setLimits] = useState<ComposerLimits | null>(null)
	/** While the pointer is down, stylesheet rules keep the resize cursor over the box. */
	const [resizing, setResizing] = useState(false)
	/** The gesture in flight: a drag is measured from where it started, not from the last frame. */
	const dragRef = useRef<{
		pointerId: number
		startY: number
		startHeight: number
		limits: ComposerLimits
		/** Whether the pointer actually travelled, which is what makes it a drag. */
		moved: boolean
	} | null>(null)
	/** When the last drag-free click on the line ended, for the double-click reset. */
	const lastClickRef = useRef(0)
	/**
	 * The height of everything above the prompt at the last fit (the page band, the queue,
	 * the error line), so a change there can be given to the transcript instead of the
	 * prompt. `null` until the first measurement of a sized composer.
	 */
	const chromeRef = useRef<number | null>(null)
	/**
	 * The page list opens between the composer's top edge and the box, so it costs the
	 * transcript room, never the prompt. It also opens by itself when a page joins the chat
	 * (see below); like the dragged height it is in-memory, so a reopened panel starts with
	 * it closed.
	 */
	const [pagesOpen, setPagesOpen] = useState(false)

	const hasPages = pages.length > 0
	const sized = height !== null
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
		if (sized) {
			// The box flex-fills the sized composer, so the textarea scrolls inside it instead
			// of growing past the height the user dragged.
			textarea.style.height = ''
			return
		}
		textarea.style.height = '0px'
		textarea.style.height = `${Math.min(240, Math.max(40, textarea.scrollHeight))}px`
	}, [draft, sized])

	/**
	 * What the DOM says about the gesture about to start: the composer's height now, the
	 * textarea's share of it (every other row keeps its own), and the room above. Measured,
	 * never guessed — the page list and the queue change how tall the chrome is.
	 */
	const measureLimits = (): ({ height: number; transcriptHeight: number } & ComposerLimits) | null => {
		const composer = composerRef.current
		const textarea = textareaRef.current
		if (!composer || !textarea) return null
		const height = composer.getBoundingClientRect().height
		// The composer does not own the transcript, so it is looked up once per gesture.
		const transcriptHeight = document.querySelector('.transcript')?.getBoundingClientRect().height ?? 0
		return {
			height,
			transcriptHeight,
			...composerLimits({
				height,
				promptHeight: textarea.clientHeight,
				promptFloor: Number.parseFloat(getComputedStyle(textarea).minHeight) || 0,
				transcriptHeight,
			}),
		}
	}

	/**
	 * A row that arrives above the prompt — the page list opening, a queued item, an error
	 * line — is paid for by the transcript, never by the prompt: the composer grows upward
	 * by exactly what the row added and gives it back when the row goes, so the height the
	 * user dragged is the height of the prompt. Without this the rows above would eat the
	 * editor, and a composer at its floor would lose the prompt entirely.
	 *
	 * A fit caused by the window (no change in the chrome) still pulls the composer back
	 * inside the panel. `chromeRef` is the rows above the prompt at the last fit, and the
	 * updater form keeps `height` out of the dependency list, so this never re-runs for the
	 * height it may change.
	 */
	useEffect(() => {
		if (!sized) return
		const fit = () => {
			const measured = measureLimits()
			if (!measured) return
			const composer = composerRef.current
			const box = composer?.querySelector('.composer__box')
			const chrome =
				composer && box ? composer.getBoundingClientRect().height - box.getBoundingClientRect().height : 0
			const delta = chromeRef.current === null ? 0 : chrome - chromeRef.current
			chromeRef.current = chrome
			setLimits({ min: measured.min, max: measured.max })
			setHeight((current) => {
				if (current === null) return null
				if (delta !== 0) {
					// The panel's own limit: the transcript may go to nothing, never negative.
					const panel = measured.height + measured.transcriptHeight
					return composerHeightForChrome(current, delta, measured.min, panel)
				}
				return clampComposerHeight(current, measured)
			})
		}
		fit()
		window.addEventListener('resize', fit)
		return () => window.removeEventListener('resize', fit)
		// `sized` is the gate; the rest are the rows that can change the measured floor.
	}, [sized, queue.length, pages.length, pagesOpen, addPageError])

	/**
	 * The line's click, but not its drag: the pointer is captured so the gesture survives
	 * leaving the 10px strip, and the default is prevented so a drag never takes the caret
	 * away from the prompt. Nothing moves until the pointer has actually travelled.
	 */
	const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return
		const measured = measureLimits()
		if (!measured) return
		event.preventDefault()
		event.currentTarget.setPointerCapture(event.pointerId)
		const { height: startHeight, min, max } = measured
		dragRef.current = {
			pointerId: event.pointerId,
			startY: event.clientY,
			startHeight,
			limits: { min, max },
			moved: false,
		}
		setLimits({ min, max })
	}

	const moveResize = (event: React.PointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current
		if (!drag || drag.pointerId !== event.pointerId) return
		const dy = event.clientY - drag.startY
		if (!drag.moved) {
			if (Math.abs(dy) < DRAG_THRESHOLD) return
			drag.moved = true
			setResizing(true)
		}
		setHeight(clampComposerHeight(composerHeightFromDrag(drag.startHeight, dy), drag.limits))
	}

	/**
	 * Releasing decides what the gesture was: a drag keeps its height, a click either starts
	 * the double-click clock or — if the previous click is inside its window — resets the
	 * composer to the natural size.
	 */
	const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current
		if (!drag || drag.pointerId !== event.pointerId) return
		dragRef.current = null
		setResizing(false)
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId)
		}
		if (drag.moved) return
		const now = Date.now()
		if (isResetGesture(lastClickRef.current, now)) {
			lastClickRef.current = 0
			setHeight(null)
			setLimits(null)
			return
		}
		lastClickRef.current = now
	}

	/** Arrow keys are the gesture a keyboard has: up grows, down shrinks, both clamped. */
	const nudgeResize = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
		event.preventDefault()
		const measured = measureLimits()
		if (!measured) return
		const current = height ?? measured.height
		const delta = event.key === 'ArrowUp' ? RESIZE_STEP : -RESIZE_STEP
		setLimits({ min: measured.min, max: measured.max })
		setHeight(clampComposerHeight(current + delta, measured))
	}

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
		// The click may have come from the Submit button (or a queued prompt's return), and
		// the prompt is where the next keystroke belongs. It is also what keeps the focus
		// ring honest: it is drawn for the prompt's focus, so the composer is ready to type
		// in exactly when it looks ready.
		textareaRef.current?.focus()
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
	 * The editor band is the prompt's click surface, so a click on its own chrome — the space
	 * beside the toolbar chips, the gap after the last one — focuses the textarea. Clicking a
	 * non-focusable element would otherwise drop the caret to <body>, which is why only the
	 * text itself used to work. A control keeps its own click; the popover and the slash
	 * menu are excluded because their padding is menu surface, not prompt chrome. The page
	 * band sits above this element inside the same border, so none of its clicks reach this
	 * handler: the composer is one surface but two interactive areas.
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
		<div
			ref={composerRef}
			className={`composer${sized ? ' composer--sized' : ''}${resizing ? ' composer--resizing' : ''}`}
			style={height === null ? undefined : { height }}
		>
			{/* The composer's top edge: the line replaces the divider it used to draw, and the
			    strip around it is the grab area. */}
			<div
				className="composer__resizer"
				role="separator"
				aria-orientation="horizontal"
				aria-label="Resize prompt"
				aria-valuenow={height ?? undefined}
				aria-valuemin={sized && limits ? limits.min : undefined}
				aria-valuemax={sized && limits ? limits.max : undefined}
				tabIndex={0}
				title="Drag to resize · double-click to reset"
				onPointerDown={startResize}
				onPointerMove={moveResize}
				onPointerUp={endResize}
				onPointerCancel={endResize}
				onKeyDown={nudgeResize}
			/>
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

			{/* One surface, two bands: the page header and the list it opens, then the prompt
			    editor. Only the outer border is drawn, and only it lights up with focus. */}
			<div className={`composer__editor${streaming ? ' composer__editor--streaming' : ''}`}>
				<PageList
					pages={pages}
					busy={addPageBusy}
					open={pagesOpen}
					addDisabled={!activeTab || addPageBusy}
					addTitle={
						activeTab
							? `Add “${activeTab.title}” to this chat`
							: 'Add the page you are reading to this chat'
					}
					onToggle={() => setPagesOpen((value) => !value)}
					onAdd={onAddCurrentPage}
					onOpen={onOpenPage}
					onRemove={onRemovePage}
				/>

				<div className="composer__box" onMouseDown={focusPrompt}>
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

						<ModelPicker
							settings={settings}
							current={modelRef}
							onSelect={onModelChange}
							onDefaultChange={(ref) =>
								updateSettings((settings) => ({ ...settings, defaultModel: ref }))
							}
						/>

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
