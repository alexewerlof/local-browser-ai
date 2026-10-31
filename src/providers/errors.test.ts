import { describe, expect, it } from 'vitest'
import { AppError, errorHint, isContextOverflowMessage, toAppError } from './errors'

class ApiErrorLike extends Error {
	statusCode: number
	constructor(statusCode: number, message = 'request failed') {
		super(message)
		this.statusCode = statusCode
	}
}

describe('isContextOverflowMessage', () => {
	it('recognises the common phrasings', () => {
		expect(isContextOverflowMessage('This model has a maximum context length of 8192 tokens')).toBe(true)
		expect(isContextOverflowMessage('The prompt is too long')).toBe(true)
		expect(isContextOverflowMessage('input is too long for this model')).toBe(true)
		expect(isContextOverflowMessage('All good')).toBe(false)
	})
})

describe('toAppError', () => {
	it('maps abort errors', () => {
		const error = new Error('aborted')
		error.name = 'AbortError'
		expect(toAppError(error).kind).toBe('aborted')
	})

	it('maps HTTP status codes', () => {
		expect(toAppError(new ApiErrorLike(401)).kind).toBe('auth')
		expect(toAppError(new ApiErrorLike(403)).kind).toBe('auth')
		expect(toAppError(new ApiErrorLike(404)).kind).toBe('model-not-found')
		expect(toAppError(new ApiErrorLike(429)).kind).toBe('rate-limit')
		expect(toAppError(new ApiErrorLike(500)).kind).toBe('network')
		expect(toAppError(new ApiErrorLike(400)).kind).toBe('invalid-request')
	})

	it('treats a context overflow body as overflow even with status 400', () => {
		const error = new ApiErrorLike(400, 'maximum context length exceeded')
		expect(toAppError(error).kind).toBe('context-overflow')
	})

	it('marks rate limits and network failures retryable', () => {
		expect(toAppError(new ApiErrorLike(429)).retryable).toBe(true)
		expect(toAppError(new TypeError('Failed to fetch')).retryable).toBe(true)
		expect(toAppError(new ApiErrorLike(401)).retryable).toBe(false)
	})

	it('keeps an AppError as-is', () => {
		const original = new AppError('unsupported', 'nope')
		expect(toAppError(original)).toBe(original)
	})

	it('provides a hint for every kind', () => {
		expect(errorHint('auth')).toMatch(/API key/)
		expect(errorHint('context-overflow')).toMatch(/Compact/)
	})
})
