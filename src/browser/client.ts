import { AppError, toAppError } from '../providers/errors'
import { getChrome } from '../platform/chrome'
import type { OmniboxPrompt } from '../core/omnibox'
import { extractPageInPageContext } from './extract/inject'
import { EVENT_FLAG, RPC_FLAG, type BackgroundRequest, type TabInfo } from './protocol'

const TIMEOUT_MS = 20_000

/**
 * Send a typed request to the background service worker and unwrap the result.
 *
 * Unlike the previous `MessageClient`, failures keep their `AppError.kind` and the call
 * times out instead of hanging forever when the service worker is gone.
 */
export async function callBackground(request: BackgroundRequest): Promise<unknown> {
	const chromeApi = getChrome()
	if (!chromeApi?.runtime?.sendMessage) {
		throw new AppError('unsupported', 'The extension background service is not available.')
	}

	const message = { [RPC_FLAG]: true, request }
	let response: unknown
	try {
		response = await withTimeout(
			chromeApi.runtime.sendMessage(message) as Promise<unknown>,
			TIMEOUT_MS,
			'The extension background service did not answer.',
		)
	} catch (error) {
		throw toAppError(error)
	}

	if (typeof response !== 'object' || response === null) {
		throw new AppError('network', 'The extension background service returned an empty response.')
	}
	const envelope = response as { ok: boolean; value?: unknown; error?: { kind: string; message: string } }
	if (!envelope.ok) {
		throw new AppError(
			(envelope.error?.kind as AppError['kind']) ?? 'unknown',
			envelope.error?.message ?? 'Background request failed.',
		)
	}
	return envelope.value
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new AppError('network', message)), ms)
		promise.then(
			(value) => {
				clearTimeout(timer)
				resolve(value)
			},
			(error) => {
				clearTimeout(timer)
				reject(error)
			},
		)
	})
}

/**
 * Take the tabs the user asked to add from the context menu.
 *
 * The background answers from memory, but a panel opened by a fresh worker can start
 * before the menu handler has finished, so give it a few short retries.
 */
export async function takePendingPages(attempts = 3, delayMs = 120): Promise<number[]> {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		const value = (await callBackground({ type: 'page.pending' })) as { tabIds: number[] }
		if (value.tabIds.length > 0) return value.tabIds
		if (attempt < attempts - 1) {
			await new Promise((resolve) => setTimeout(resolve, delayMs))
		}
	}
	return []
}

/**
 * Take the prompt accepted in the address bar, if the worker still holds one.
 *
 * Retried like the page tabs: this panel may be the one the omnibox just opened, and it
 * can reach this point a few milliseconds before the worker has stored the entry. A
 * panel that was already open gets an event instead, which is only a nudge — whichever
 * path lands first takes the entry and the other finds it gone.
 */
export async function takePendingOmniboxPrompt(attempts = 3, delayMs = 120): Promise<OmniboxPrompt | null> {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		const value = (await callBackground({ type: 'prompt.pending' })) as { prompt: OmniboxPrompt | null }
		if (value.prompt) return value.prompt
		if (attempt < attempts - 1) {
			await new Promise((resolve) => setTimeout(resolve, delayMs))
		}
	}
	return null
}

/** Bring the page behind a card back on screen, reopening it when its tab is gone. */
export async function focusPage(tabId: number | undefined, url: string): Promise<void> {
	await callBackground({ type: 'page.focus', tabId, url })
}

export async function getTabInfo(tabId?: number): Promise<TabInfo> {
	return (await callBackground({ type: 'tab.info', tabId })) as TabInfo
}

export async function extractTab(tabId?: number) {
	return (await callBackground({ type: 'tab.extract', tabId })) as import('./extract/inject').InjectResult
}

export async function getTabSelection(tabId?: number): Promise<string> {
	const value = (await callBackground({ type: 'tab.selection', tabId })) as { text: string }
	return value.text
}

export async function openUrl(url: string, newWindow = false): Promise<void> {
	await callBackground({ type: 'tab.open', url, newWindow })
}

/**
 * Search with the user's default search engine. The results open in a tab; the API
 * returns no text, so the caller must not expect any.
 */
export async function searchWeb(
	text: string,
	disposition: import('./protocol').SearchDisposition = 'NEW_TAB',
): Promise<import('./protocol').SearchDisposition> {
	const value = (await callBackground({ type: 'search.query', text, disposition })) as {
		disposition: import('./protocol').SearchDisposition
	}
	return value.disposition
}

/** Subscribe to background events (page adds, context-menu selections). */
export function onBackgroundEvent(listener: (event: import('./protocol').BackgroundEvent) => void): () => void {
	const chromeApi = getChrome()
	if (!chromeApi?.runtime?.onMessage) return () => {}
	const handler = (message: unknown) => {
		if (typeof message !== 'object' || message === null) return false
		const envelope = message as Record<string, unknown>
		if (envelope[EVENT_FLAG] !== true) return false
		listener((envelope as unknown as { event: import('./protocol').BackgroundEvent }).event)
		return false
	}
	chromeApi.runtime.onMessage.addListener(handler)
	return () => chromeApi.runtime.onMessage.removeListener(handler)
}

export { extractPageInPageContext }
