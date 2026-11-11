/** Small helpers shared across the app. */

export function createId(prefix = 'id'): string {
	const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
	return `${prefix}_${random}`
}

export function now(): number {
	return Date.now()
}

/** Resolve after `ms`. Used to poll a browser API that answers before the thing it started exists. */
export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/** http(s) only: every page the extension can capture lives there. */
export function isHttpUrl(url: string | undefined): url is string {
	return typeof url === 'string' && /^https?:\/\//i.test(url)
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

/**
 * A compact "when" for a row the same thing can appear in twice.
 *
 * The clock time always, to the second — two captures of one document can be a minute
 * apart, so the seconds are the point. The date joins it only once the capture is on
 * another calendar day; a date repeated down every row added today is noise. Nothing here
 * is relative: a list left open for a while would keep claiming "2 minutes ago" long after
 * it stopped being true.
 *
 * Both halves come from `Intl`, so the clock convention, the calendar and the wording are
 * the user's own.
 */
export function stampTime(timestamp: number, reference = Date.now()): string {
	const at = new Date(timestamp)
	if (Number.isNaN(at.getTime())) return ''
	const now = new Date(reference)

	const time = at.toLocaleTimeString(undefined, {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	})
	// `toDateString` is locale-independent, which makes this a same-day check rather than
	// a comparison of two localized date strings.
	if (at.toDateString() === now.toDateString()) return time

	const sameYear = at.getFullYear() === now.getFullYear()
	const date = at.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		...(sameYear ? {} : { year: 'numeric' }),
	})
	return `${date}, ${time}`
}

/**
 * The exact instant, in ISO 8601, for the `<time>` element and the tooltip that spells it
 * out in full — the row itself only shows what has to be there to tell two captures apart.
 */
export function stampIso(timestamp: number): string | undefined {
	const at = new Date(timestamp)
	// `toISOString` throws on an invalid date, and a stored page may predate the field.
	return Number.isNaN(at.getTime()) ? undefined : at.toISOString()
}

/**
 * The same instant in the user's own locale and calendar, for the native tooltip: a reader
 * who does not decode ISO 8601 should not need to. `dateStyle: 'full'` spells the weekday
 * and the year out, which is exactly what the row leaves in the tooltip.
 */
let fullFormat: Intl.DateTimeFormat | undefined

export function stampTooltip(timestamp: number): string | undefined {
	const at = new Date(timestamp)
	if (Number.isNaN(at.getTime())) return undefined
	fullFormat ??= new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long' })
	return fullFormat.format(at)
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
