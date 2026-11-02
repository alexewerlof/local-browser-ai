import { useState } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'
import { formatDuration, formatTokens } from '../../core/util'
import type { ReasoningPart } from '../../core/types'

export function ReasoningBlock({ part, streaming }: { part: ReasoningPart; streaming: boolean }) {
	const [open, setOpen] = useState(false)
	const tokens = Math.ceil(part.text.length / 4)

	return (
		<div className={`reasoning${open ? ' reasoning--open' : ''}`}>
			<button type="button" className="reasoning__toggle" onClick={() => setOpen((value) => !value)}>
				<Brain size={13} />
				<span>{streaming ? 'Thinking…' : 'Thought process'}</span>
				<span className="faint">
					{part.durationMs ? formatDuration(part.durationMs) : ''}
					{part.durationMs ? ' · ' : ''}~{formatTokens(tokens)} tokens
				</span>
				{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
			</button>
			{open && <div className="reasoning__body">{part.text}</div>}
		</div>
	)
}
