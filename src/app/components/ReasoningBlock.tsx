import { useState } from 'react'
import { formatDuration, formatTokens } from '../../core/util'
import type { ReasoningPart } from '../../core/types'
import { Icon } from './Icon'

export function ReasoningBlock({ part, streaming }: { part: ReasoningPart; streaming: boolean }) {
	const [open, setOpen] = useState(false)
	const tokens = Math.ceil(part.text.length / 4)

	return (
		<div className={`reasoning${open ? ' reasoning--open' : ''}`}>
			<button type="button" className="reasoning__toggle" onClick={() => setOpen((value) => !value)}>
				<Icon name="brain" size={13} />
				<span>{streaming ? 'Thinking…' : 'Thought process'}</span>
				<span className="faint">
					{part.durationMs ? formatDuration(part.durationMs) : ''}
					{part.durationMs ? ' · ' : ''}~{formatTokens(tokens)} tokens
				</span>
				<Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} />
			</button>
			{open && <div className="reasoning__body">{part.text}</div>}
		</div>
	)
}
