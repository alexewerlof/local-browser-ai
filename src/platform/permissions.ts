import { getChrome } from './chrome'

/**
 * Host permissions are port-agnostic in Chrome: granting `http://mac-mini/*` also covers
 * `http://mac-mini:8080/`. The pattern therefore carries the hostname only, which matches
 * the wording of the prompt Chrome shows the user.
 */
function parseOrigin(url: string): { pattern: string; host: string } | null {
	try {
		const parsed = new URL(url)
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
		return { pattern: `${parsed.protocol}//${parsed.hostname}/*`, host: parsed.hostname }
	} catch {
		return null
	}
}

/** `https://api.openai.com/v1` -> `https://api.openai.com/*` */
export function originPattern(url: string): string | null {
	return parseOrigin(url)?.pattern ?? null
}

/** The host of `url` as the user typed it (port included), or the raw input when it does not parse. */
export function hostOf(url: string): string {
	try {
		return new URL(url).host
	} catch {
		return url
	}
}

function isLoopback(url: string): boolean {
	try {
		const host = new URL(url).hostname
		return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
	} catch {
		return false
	}
}

export async function hasHostAccess(url: string): Promise<boolean> {
	const pattern = originPattern(url)
	if (!pattern) return false
	if (isLoopback(url)) return true
	const chromeApi = getChrome()
	if (!chromeApi?.permissions?.contains) return true
	try {
		return await chromeApi.permissions.contains({ origins: [pattern] })
	} catch {
		return false
	}
}

/**
 * Ask for host access, prompting the user when the origin is not granted yet.
 *
 * Chrome only shows that prompt from `chrome.permissions.request()`, and only while a user
 * gesture is live, so call this first in a click handler — before any other `await`.
 * Already-granted origins resolve `true` without a prompt, and URLs that need no permission
 * (loopback, non-http) also return `true`, so callers can gate on the result alone.
 */
export async function requestHostAccess(url: string): Promise<boolean> {
	const pattern = originPattern(url)
	if (!pattern) return false
	if (isLoopback(url)) return true
	const chromeApi = getChrome()
	if (!chromeApi?.permissions?.request) return true
	try {
		return await chromeApi.permissions.request({ origins: [pattern] })
	} catch {
		return false
	}
}
