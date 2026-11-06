import { useState } from 'react'
import type { ContextSnapshot } from '../../state/chat'
import { formatTokens } from '../../core/util'
import { RefreshCw, Settings } from 'lucide-react'
import { openSettings } from '../../platform/chrome'
import { Popover } from './Popover'

const PART_COLORS: Record<string, string> = {
	system: 'var(--accent)',
	environment: 'var(--fg-faint)',
	memory: 'var(--memory)',
	page: 'var(--success)',
	summary: 'var(--warning)',
	history: 'var(--secondary, oklch(0.62 0.13 250))',
	mcp: 'var(--accent-strong)',
}

export function ContextMeter({
	snapshot,
	busy,
	onCompact,
}: {
	snapshot: ContextSnapshot
	busy: boolean
	onCompact: () => void
}) {
	const [open, setOpen] = useState(false)
	const window = snapshot.contextWindow || 1
	const percent = Math.round((snapshot.usedTokens / window) * 100)
	const threshold = Math.round((snapshot.compactionAt / window) * 100)
	const level = percent >= 90 ? 'danger' : percent >= threshold ? 'warn' : 'ok'

	return (
		<Popover
			open={open}
			onClose={() => setOpen(false)}
			width={320}
			align="start"
			trigger={
				<button
					type="button"
					className="meter"
					onClick={() => setOpen((value) => !value)}
					title="What is using the context window"
				>
					<span className="meter__bar" aria-hidden="true">
						{snapshot.parts.map((part) => (
							<span
								key={part.id}
								className="meter__segment"
								style={{
									width: `${Math.max(0.5, (part.tokens / window) * 100)}%`,
									background: PART_COLORS[part.id] ?? 'var(--fg-faint)',
								}}
							/>
						))}
						<span
							className="meter__threshold"
							style={{ left: `${Math.min(100, (snapshot.compactionAt / window) * 100)}%` }}
						/>
					</span>
					<span className={`meter__label meter__label--${level}`}>
						{formatTokens(snapshot.usedTokens)} / {formatTokens(snapshot.contextWindow)}
						<span className="faint"> · {percent}%</span>
					</span>
				</button>
			}
		>
			<div className="popover__group">
				<div className="popover__group-label">Context window</div>
				{snapshot.parts.map((part) => (
					<div key={part.id} className="context-row" title={part.detail}>
						<span className="context-row__swatch" style={{ background: PART_COLORS[part.id] }} />
						<span className="context-row__label">{part.label}</span>
						<span className="badge">{formatTokens(part.tokens)}</span>
					</div>
				))}
				{snapshot.parts.length === 0 && <p className="popover__empty">Nothing in the context yet.</p>}
			</div>

			<div className="popover__group">
				<div className="context-row">
					<span className="context-row__label muted">Compacts at</span>
					<span className="badge">{formatTokens(snapshot.compactionAt)}</span>
				</div>
			</div>

			<div className="popover__footer row" style={{ gap: 'var(--space-3)' }}>
				<button
					type="button"
					className="button button--sm"
					onClick={() => {
						setOpen(false)
						onCompact()
					}}
					disabled={busy}
				>
					<RefreshCw size={13} />
					Compact now
				</button>
				<button
					type="button"
					className="button button--ghost button--sm"
					onClick={() => {
						setOpen(false)
						void openSettings('context')
					}}
				>
					<Settings size={13} />
					Context settings
				</button>
			</div>
		</Popover>
	)
}
