import { useState } from 'react'
import { ChevronDown, ChevronRight, ListChecks } from 'lucide-react'
import type { ChatMessage } from '../../core/types'
import { describeSteps, type StepPart } from '../../core/steps'
import { approvalsStore, toolTabsStore } from '../../state/browser'
import { stepLimitStore } from '../../state/chat'
import { attachedPageOf } from '../tool-display'
import { useStore } from '../useStore'
import { ReasoningBlock } from './ReasoningBlock'
import { ToolCallCard } from './ToolCallCard'

/**
 * The steps of one answer: the model's reasoning and the tools it called, as one flow that
 * folds away when the run ends.
 *
 * While the run streams the rows stay on screen, because on a local model they are the only
 * sign of progress there is. Once it finishes they collapse into a single line — unless a
 * row still needs the user, because hiding a question is worse than a busy transcript.
 */
export function StepsGroup({
	message,
	parts,
	streaming,
	isLast,
}: {
	message: ChatMessage
	/** Only the step parts of the message, in transcript order. */
	parts: StepPart[]
	streaming: boolean
	/** True for the newest message, where the run's own state belongs. */
	isLast: boolean
}) {
	const approvals = useStore(approvalsStore)
	const toolTabs = useStore(toolTabsStore)
	const stepLimit = useStore(stepLimitStore)
	// `null` follows the run: open while it streams or while a row needs an answer, folded
	// once it is done. A click pins the choice, so what the user opened stays open.
	const [pinned, setPinned] = useState<boolean | null>(null)

	const toolCalls = parts.filter((part) => part.type === 'tool-call')
	const waitingApproval = toolCalls.some((call) => approvals.some((entry) => entry.id === call.toolCallId))
	// The card offers "Add page to chat" until the page is in the chat; that button is the
	// way back in when a site grant was denied, so the group must not fold over it.
	const waitingPage = toolCalls.some(
		(call) => toolTabs.has(call.toolCallId) && attachedPageOf(call.output) === undefined,
	)
	const needsInteraction =
		waitingApproval ||
		waitingPage ||
		(isLast && stepLimit !== null) ||
		message.status === 'error' ||
		message.status === 'aborted'
	// One lone reasoning row is not a group: it is already the whole answer's thinking, and
	// folding it would hide the only step behind a summary that says the same thing.
	const groupable = toolCalls.length > 0 || parts.length > 1
	const folded = groupable && !streaming && !needsInteraction
	const showRows = pinned ?? !folded

	return (
		<div className="steps">
			{groupable && !streaming && (
				<button
					type="button"
					className="steps__summary"
					aria-expanded={showRows}
					onClick={() => setPinned(!showRows)}
				>
					<ListChecks size={13} />
					<span>{describeSteps(message)}</span>
					{showRows ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
				</button>
			)}
			{showRows && (
				<ol className="steps__list">
					{parts.map((part, index) => (
						<li
							key={part.type === 'tool-call' ? part.toolCallId : `reasoning-${index}`}
							className="steps__item"
						>
							{part.type === 'tool-call' ? (
								<ToolCallCard part={part} />
							) : (
								<ReasoningBlock part={part} streaming={streaming && index === parts.length - 1} />
							)}
						</li>
					))}
				</ol>
			)}
		</div>
	)
}
