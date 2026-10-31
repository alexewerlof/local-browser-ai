import type { ErrorKind } from '../core/types'

/** Error type used everywhere in the app; carries a machine-readable kind and retryability. */
export class AppError extends Error {
	readonly kind: ErrorKind
	readonly retryable: boolean
	readonly status?: number

	constructor(
		kind: ErrorKind,
		message: string,
		options: { retryable?: boolean; status?: number; cause?: unknown } = {},
	) {
		super(message, options.cause === undefined ? undefined : { cause: options.cause })
		this.name = 'AppError'
		this.kind = kind
		this.retryable = options.retryable ?? isRetryableKind(kind)
		this.status = options.status
	}
}

export function isRetryableKind(kind: ErrorKind): boolean {
	return kind === 'rate-limit' || kind === 'network' || kind === 'unknown'
}

const CONTEXT_OVERFLOW_PATTERNS = [
	/context length/i,
	/context window/i,
	/maximum context/i,
	/too many tokens/i,
	/prompt is too long/i,
	/input is too long/i,
	/exceeds? the (model'?s )?maximum/i,
	/reduce the length/i,
]

function messageOf(error: unknown): string {
	if (error instanceof Error) return error.message
	if (typeof error === 'string') return error
	try {
		return JSON.stringify(error)
	} catch {
		return String(error)
	}
}

export function isContextOverflowMessage(message: string): boolean {
	return CONTEXT_OVERFLOW_PATTERNS.some((pattern) => pattern.test(message))
}

function statusOf(error: unknown): number | undefined {
	if (typeof error !== 'object' || error === null) return undefined
	const candidate = error as { statusCode?: unknown; status?: unknown }
	if (typeof candidate.statusCode === 'number') return candidate.statusCode
	if (typeof candidate.status === 'number') return candidate.status
	return undefined
}

/**
 * Normalise anything thrown by the AI SDK, fetch, or the browser into an `AppError`.
 * Context overflow is detected before status codes because providers report it as 400/413.
 */
export function toAppError(error: unknown): AppError {
	if (error instanceof AppError) return error

	if (error instanceof DOMException && error.name === 'AbortError') {
		return new AppError('aborted', 'Generation stopped.')
	}
	if (error instanceof Error && error.name === 'AbortError') {
		return new AppError('aborted', 'Generation stopped.')
	}

	const message = messageOf(error)
	if (isContextOverflowMessage(message)) {
		return new AppError('context-overflow', message, { cause: error })
	}

	const status = statusOf(error)
	if (status !== undefined) {
		if (status === 401 || status === 403) return new AppError('auth', message, { status, cause: error })
		if (status === 404) return new AppError('model-not-found', message, { status, cause: error })
		if (status === 413) return new AppError('context-overflow', message, { status, cause: error })
		if (status === 429) return new AppError('rate-limit', message, { status, cause: error })
		if (status >= 500) return new AppError('network', message, { status, cause: error })
		if (status >= 400) return new AppError('invalid-request', message, { status, cause: error })
	}

	if (error instanceof TypeError) {
		// `fetch` rejects with TypeError for DNS failures, refused connections and CORS.
		return new AppError(
			'network',
			`Could not reach the provider (${message}). Check the URL, that the server is running, and that the extension has permission for this host.`,
			{ cause: error },
		)
	}

	return new AppError('unknown', message || 'Something went wrong.', { cause: error })
}

/** A short, user-facing explanation for each error kind. */
export function errorHint(kind: ErrorKind): string {
	switch (kind) {
		case 'auth':
			return 'The API key was rejected. Check the key and the provider settings.'
		case 'rate-limit':
			return 'The provider is rate limiting requests. Wait a moment and retry.'
		case 'context-overflow':
			return 'The conversation no longer fits the context window. Compact it or start a new chat.'
		case 'network':
			return 'The provider could not be reached.'
		case 'model-not-found':
			return 'The model or endpoint was not found. Refresh the model list in Settings.'
		case 'permission':
			return 'The extension needs permission for this host. Grant it in Settings.'
		case 'unsupported':
			return 'This model or provider does not support that feature.'
		case 'invalid-request':
			return 'The provider rejected the request.'
		case 'aborted':
			return 'Stopped.'
		default:
			return 'Unexpected error.'
	}
}
