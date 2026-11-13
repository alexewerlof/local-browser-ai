import type { ErrorKind } from '../core/types'
import type { OmniboxPrompt } from '../core/omnibox'

export interface TabInfo {
	id: number
	windowId: number
	url: string
	title: string
	faviconUrl?: string
}

/** Mirrors `chrome.search.Disposition`; the enum is local so the panel needs no chrome API. */
export type SearchDisposition = 'CURRENT_TAB' | 'NEW_TAB' | 'NEW_WINDOW'

/**
 * What a search produced. `chrome.search.query` resolves `void`, so the tab is worked out
 * by the worker; it is best effort, because the results page may still be loading.
 */
export interface SearchResult {
	disposition: SearchDisposition
	tabId?: number
	url?: string
}

/**
 * The tab showing a card's page, and whether it had to be opened again.
 * A reopened tab is the extension's doing and joins the chat's tab group; a tab that was
 * already there is the user's, and is left where it is.
 */
export interface FocusPageResult {
	tabId?: number
	opened: boolean
}

export type BackgroundRequest =
	| { type: 'page.pending' }
	| { type: 'prompt.pending' }
	| { type: 'page.focus'; tabId?: number; url: string }
	| { type: 'tab.info'; tabId?: number }
	| { type: 'tab.extract'; tabId?: number }
	| { type: 'tab.selection'; tabId?: number }
	| { type: 'tab.open'; url: string; newWindow?: boolean }
	| { type: 'search.query'; text: string; disposition: SearchDisposition; conversationId: string }

export interface RequestResults {
	'page.pending': { tabIds: number[] }
	'prompt.pending': { prompt: OmniboxPrompt | null }
	'page.focus': FocusPageResult
	'tab.info': TabInfo
	'tab.extract': import('./extract/inject').InjectResult
	'tab.selection': { text: string }
	'tab.open': { tabId?: number }
	'search.query': SearchResult
}

export type BackgroundResponse =
	{ ok: true; value: unknown } | { ok: false; error: { kind: ErrorKind; message: string } }

export type BackgroundEvent =
	| { type: 'page.add'; tabId: number }
	| { type: 'prompt.add' }
	| { type: 'selection.add'; text: string; tabId: number; url: string; title: string }

export const RPC_FLAG = '__lbai_rpc__'
export const EVENT_FLAG = '__lbai_event__'

export interface RpcEnvelope {
	[RPC_FLAG]: true
	request: BackgroundRequest
}

export interface EventEnvelope {
	[EVENT_FLAG]: true
	event: BackgroundEvent
}

export function isRpcEnvelope(message: unknown): message is RpcEnvelope {
	return typeof message === 'object' && message !== null && (message as Record<string, unknown>)[RPC_FLAG] === true
}

export function isEventEnvelope(message: unknown): message is EventEnvelope {
	return typeof message === 'object' && message !== null && (message as Record<string, unknown>)[EVENT_FLAG] === true
}
