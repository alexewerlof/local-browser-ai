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

/**
 * Whether the browser can ask for a site through the toolbar chip instead of a modal.
 *
 * Chrome 133 added it; older builds and some forks only have `request()`.
 */
export function supportsHostAccessRequest(): boolean {
	return typeof getChrome()?.permissions?.addHostAccessRequest === 'function'
}

/**
 * Ask for host access from the page's own toolbar chip.
 *
 * Unlike `requestHostAccess` this needs no user gesture, so it may follow other awaits: it
 * does not open a modal, it puts a chip on the tab. Resolves false when the browser cannot
 * show one at all. There is no "denied" event either — an ignored chip and a dismissed one
 * look the same — so the caller waits for `onHostAccessGranted` instead of for an answer.
 */
export async function addHostAccessRequest(tabId: number): Promise<boolean> {
	const chromeApi = getChrome()
	const api = chromeApi?.permissions
	if (typeof api?.addHostAccessRequest !== 'function') return false
	try {
		await api.addHostAccessRequest({ tabId })
		return true
	} catch {
		return false
	}
}

/** Take the chip away again, so an abandoned request does not linger on the tab. */
export async function removeHostAccessRequest(tabId: number): Promise<void> {
	const api = getChrome()?.permissions
	if (typeof api?.removeHostAccessRequest !== 'function') return
	try {
		await api.removeHostAccessRequest({ tabId })
	} catch {
		// The chip is gone already, or the tab was closed.
	}
}

/**
 * Fires with the origins the user just granted, from any prompt or chip. Returns an
 * unsubscribe function.
 */
export function onHostAccessGranted(listener: (origins: string[]) => void): () => void {
	const event = getChrome()?.permissions?.onAdded
	if (!event) return () => {}
	const handler = (granted: chrome.permissions.Permissions) => {
		const origins = granted.origins ?? []
		if (origins.length > 0) listener(origins)
	}
	event.addListener(handler)
	return () => event.removeListener(handler)
}

/** Whether a grant reported by the browser covers `url`. */
export function grantsOrigin(origins: string[], url: string): boolean {
	const pattern = originPattern(url)
	const host = hostOf(url)
	return origins.some((origin) => origin === pattern || origin.includes(`//${host}/`))
}
