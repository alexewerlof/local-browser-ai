import { useState } from 'react'
import { TriangleAlert, X } from 'lucide-react'
import {
	cancelStepLimit,
	clearRunError,
	compactNow,
	continueRun,
	conversationStore,
	contextStore,
	queuePausedStore,
	regenerate,
	removeConversation,
	resumeQueue,
	runStore,
	setModel,
	stepLimitStore,
	submitPrompt,
	stopGeneration,
	newChat,
	openConversation,
} from '../state/chat'
import { addPageBusyStore, addPageErrorStore } from '../state/composer'
import { addCurrentPage, allowPageAccess, bootStatusStore, cancelPageAccess, pageAccessStore } from '../state/bootstrap'
import { dismissMcpWarning, mcpWarningsStore } from '../state/mcp'
import { promptStatusStore } from '../state/prompt'
import { settingsStore, updateSettings } from '../state/settings'
import { openSettings } from '../platform/chrome'
import { focusPage, activeTabStore } from '../state/browser'
import { pagesStore } from '../state/pages'
import { hostOf } from '../platform/permissions'
import { Composer } from './components/Composer'
import { Header } from './components/Header'
import { HistoryPanel } from './components/HistoryPanel'
import { Transcript } from './components/Transcript'
import { useStore } from './useStore'

export function App() {
	const bootStatus = useStore(bootStatusStore)
	const settings = useStore(settingsStore)
	const conversation = useStore(conversationStore)
	const run = useStore(runStore)
	const context = useStore(contextStore)
	const queuePaused = useStore(queuePausedStore)
	const stepLimit = useStore(stepLimitStore)
	const addPageBusy = useStore(addPageBusyStore)
	const addPageError = useStore(addPageErrorStore)
	const pages = useStore(pagesStore)
	const activeTab = useStore(activeTabStore)
	const pageAccess = useStore(pageAccessStore)
	const mcpWarnings = useStore(mcpWarningsStore)
	const promptStatus = useStore(promptStatusStore)
	const [historyOpen, setHistoryOpen] = useState(false)

	if (bootStatus !== 'ready') {
		return (
			<div className="boot">
				<span className="typing">
					<span />
					<span />
					<span />
				</span>
			</div>
		)
	}

	const modelRef = conversation.model ?? settings.defaultModel
	const provider = modelRef ? settings.providers.find((entry) => entry.id === modelRef.providerId) : undefined
	const builtInUnavailable =
		provider?.kind === 'prompt-api' &&
		promptStatus !== null &&
		(promptStatus.availability === 'unsupported' || promptStatus.availability === 'unavailable')
	const noModel = !modelRef

	return (
		<div className="app">
			<Header conversation={conversation} onNew={() => newChat()} onHistory={() => setHistoryOpen(true)} />

			{(builtInUnavailable || noModel) && (
				<div className="banner">
					<TriangleAlert size={14} />
					<span>
						{noModel
							? 'No model is configured yet.'
							: promptStatus?.availability === 'unsupported'
								? 'The built-in model is not available in this browser.'
								: (promptStatus?.message ?? 'The built-in model is unavailable in this browser.')}
					</span>
					<span className="spacer" />
					<button type="button" className="button button--sm" onClick={() => void openSettings('models')}>
						Set up a model
					</button>
				</div>
			)}

			<Transcript
				conversation={conversation}
				settings={settings}
				pages={pages}
				run={run}
				onRegenerate={() => void regenerate()}
				onOpenPage={(page) => void focusPage(page.tabIdHint, page.url)}
			/>

			{run.error && (
				<div className="banner banner--error">
					<TriangleAlert size={14} />
					<span>
						{run.error.message}
						{run.error.kind === 'permission' && (
							<em> Right-click the page, choose “Add to chat”, then try again.</em>
						)}
					</span>
					<span className="spacer" />
					<button type="button" className="button button--sm" onClick={() => void regenerate()}>
						Retry
					</button>
					<button
						type="button"
						className="button button--ghost button--icon button--sm"
						onClick={clearRunError}
						title="Dismiss"
					>
						<X size={13} />
					</button>
				</div>
			)}

			{pageAccess && (
				<div className="banner banner--warn">
					<TriangleAlert size={14} />
					<span>
						{pageAccess.chip
							? `Chrome is waiting for you to allow ${hostOf(pageAccess.url)} in the address bar.`
							: `Chrome needs your permission to read ${hostOf(pageAccess.url)}.`}
					</span>
					<span className="spacer" />
					<button type="button" className="button button--sm" onClick={() => void allowPageAccess()}>
						Allow
					</button>
					<button
						type="button"
						className="button button--ghost button--sm"
						onClick={() => void cancelPageAccess()}
					>
						Cancel
					</button>
				</div>
			)}

			{stepLimit && (
				<div className="banner banner--warn">
					<TriangleAlert size={14} />
					<span>
						Reached the limit of{' '}
						<button
							type="button"
							className="banner__link"
							onClick={() => void openSettings('general')}
							title="Change the tool-step limit in Settings"
						>
							{stepLimit.limit}
						</button>{' '}
						tool steps for this answer.
					</span>
					<span className="spacer" />
					<button
						type="button"
						className="button button--primary button--sm"
						onClick={() => void continueRun()}
					>
						Continue
					</button>
					<button type="button" className="button button--ghost button--sm" onClick={cancelStepLimit}>
						Cancel
					</button>
				</div>
			)}

			{mcpWarnings.map((warning) => (
				<div key={warning.id} className="banner banner--warn">
					<TriangleAlert size={14} />
					<span>{warning.message}</span>
					<span className="spacer" />
					<button
						type="button"
						className="button button--ghost button--icon button--sm"
						onClick={() => dismissMcpWarning(warning.id)}
						title="Dismiss"
					>
						<X size={13} />
					</button>
				</div>
			))}

			<Composer
				settings={settings}
				conversation={conversation}
				pages={pages}
				activeTab={activeTab}
				run={run}
				context={context}
				addPageBusy={addPageBusy}
				addPageError={addPageError}
				queuePaused={queuePaused}
				onSubmit={(text, skillId) => void submitPrompt(text, skillId)}
				onStop={stopGeneration}
				onContinue={resumeQueue}
				onOpenPage={(page) => void focusPage(page.tabIdHint, page.url)}
				onAddCurrentPage={() => void addCurrentPage()}
				onCompact={() => void compactNow()}
				onModelChange={(ref) => {
					setModel(ref)
					updateSettings((current) => ({ ...current, defaultModel: ref }))
				}}
			/>

			<HistoryPanel
				open={historyOpen}
				currentId={conversation.id}
				onClose={() => setHistoryOpen(false)}
				onOpen={(id) => void openConversation(id)}
				onDelete={(id) => void removeConversation(id)}
				onNew={() => newChat()}
			/>
		</div>
	)
}
