import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasHostAccess, hostOf, originPattern, requestHostAccess } from './permissions'

type ChromeStub = {
	runtime: { id: string }
	permissions: {
		contains: (request: { origins: string[] }) => Promise<boolean>
		request: (request: { origins: string[] }) => Promise<boolean>
	}
}

function stubChrome(permissions: Partial<ChromeStub['permissions']> = {}): ChromeStub {
	const stub: ChromeStub = {
		runtime: { id: 'test-extension' },
		permissions: {
			contains: permissions.contains ?? (() => Promise.resolve(false)),
			request: permissions.request ?? (() => Promise.resolve(false)),
		},
	}
	;(globalThis as { chrome?: unknown }).chrome = stub
	return stub
}

afterEach(() => {
	delete (globalThis as { chrome?: unknown }).chrome
})

describe('originPattern', () => {
	it('keeps the scheme and host', () => {
		expect(originPattern('https://api.openai.com/v1')).toBe('https://api.openai.com/*')
	})

	it('drops the port, because host permissions cover every port on a host', () => {
		expect(originPattern('http://llm.example.com:8080/v1')).toBe('http://llm.example.com/*')
	})

	it('keeps IPv6 brackets', () => {
		expect(originPattern('http://[::1]:8080/v1')).toBe('http://[::1]/*')
	})

	it('rejects non-http schemes and unparsable input', () => {
		expect(originPattern('file:///tmp/models')).toBeNull()
		expect(originPattern('llm.example.com:8080')).toBeNull()
		expect(originPattern('')).toBeNull()
	})
})

describe('hostOf', () => {
	it('includes the port for display', () => {
		expect(hostOf('http://llm.example.com:8080/v1')).toBe('llm.example.com:8080')
	})

	it('falls back to the raw input', () => {
		expect(hostOf('not a url')).toBe('not a url')
	})
})

describe('hasHostAccess', () => {
	it('allows loopback without asking the browser', async () => {
		const contains = vi.fn(() => Promise.reject(new Error('should not be called')))
		stubChrome({ contains })
		await expect(hasHostAccess('http://localhost:8080/v1')).resolves.toBe(true)
		await expect(hasHostAccess('http://127.0.0.1:11434')).resolves.toBe(true)
		expect(contains).not.toHaveBeenCalled()
	})

	it('queries the portless pattern for a network host', async () => {
		const contains = vi.fn(() => Promise.resolve(true))
		stubChrome({ contains })
		await expect(hasHostAccess('http://llm.example.com:8080/v1')).resolves.toBe(true)
		expect(contains).toHaveBeenCalledWith({ origins: ['http://llm.example.com/*'] })
	})

	it('reports false when the grant is missing or the query fails', async () => {
		stubChrome({ contains: () => Promise.resolve(false) })
		await expect(hasHostAccess('https://api.deepseek.com/v1')).resolves.toBe(false)

		stubChrome({ contains: () => Promise.reject(new Error('no such permission')) })
		await expect(hasHostAccess('https://api.deepseek.com/v1')).resolves.toBe(false)
	})
})

describe('requestHostAccess', () => {
	it('asks for the portless pattern and returns the decision', async () => {
		const request = vi.fn(() => Promise.resolve(true))
		stubChrome({ request })
		await expect(requestHostAccess('http://llm.example.com:8080/v1')).resolves.toBe(true)
		expect(request).toHaveBeenCalledWith({ origins: ['http://llm.example.com/*'] })
	})

	it('returns false when the user declines', async () => {
		stubChrome({ request: () => Promise.resolve(false) })
		await expect(requestHostAccess('http://llm.example.com:8080/v1')).resolves.toBe(false)
	})

	it('returns false instead of throwing when the prompt is unavailable', async () => {
		stubChrome({ request: () => Promise.reject(new Error('This function must be called during a user gesture')) })
		await expect(requestHostAccess('http://llm.example.com:8080/v1')).resolves.toBe(false)
	})

	it('does not prompt for loopback hosts', async () => {
		const request = vi.fn(() => Promise.resolve(false))
		stubChrome({ request })
		await expect(requestHostAccess('http://localhost:8080/v1')).resolves.toBe(true)
		expect(request).not.toHaveBeenCalled()
	})
})
