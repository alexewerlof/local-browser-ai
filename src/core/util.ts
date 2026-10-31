/** Small helpers shared across the app. */

export function createId(prefix = 'id'): string {
	const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
	return `${prefix}_${random}`
}

export function now(): number {
	return Date.now()
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value))
}

/** Format a token count for compact UI ("1.2k", "12k", "1.1M"). */
export function formatTokens(tokens: number): string {
	if (!Number.isFinite(tokens) || tokens < 0) return '0'
	if (tokens < 1000) return String(Math.round(tokens))
	if (tokens < 10000) return `${(tokens / 1000).toFixed(1).replace(/\.0$/, '')}k`
	if (tokens < 1_000_000) return `${Math.round(tokens / 1000)}k`
	return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)} ms`
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
	return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

export function relativeTime(timestamp: number, reference = Date.now()): string {
	const diff = reference - timestamp
	const minute = 60_000
	const hour = 60 * minute
	const day = 24 * hour
	if (diff < minute) return 'just now'
	if (diff < hour) return `${Math.floor(diff / minute)}m ago`
	if (diff < day) return `${Math.floor(diff / hour)}h ago`
	if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`
	return new Date(timestamp).toLocaleDateString()
}

/** Debounce a function; the returned function also exposes `flush` and `cancel`. */
export function debounce<Args extends unknown[]>(
	fn: (...args: Args) => void,
	waitMs: number,
): ((...args: Args) => void) & { flush: () => void; cancel: () => void } {
	let timer: ReturnType<typeof setTimeout> | null = null
	let lastArgs: Args | null = null

	const run = () => {
		timer = null
		if (!lastArgs) return
		const args = lastArgs
		lastArgs = null
		fn(...args)
	}

	const wrapped = (...args: Args) => {
		lastArgs = args
		if (timer) clearTimeout(timer)
		timer = setTimeout(run, waitMs)
	}
	wrapped.flush = () => {
		if (timer) clearTimeout(timer)
		run()
	}
	wrapped.cancel = () => {
		if (timer) clearTimeout(timer)
		timer = null
		lastArgs = null
	}
	return wrapped
}
