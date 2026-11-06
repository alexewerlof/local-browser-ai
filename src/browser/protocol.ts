import type { ErrorKind } from '../core/types'

export interface TabInfo {
	id: number
	windowId: number
	url: string
	title: string
	faviconUrl?: string
}

/** Mirrors `chrome.search.Disposition`; the enum is local so the panel needs no chrome API. */
export type SearchDisposition = 'CURRENT_TAB' | 'NEW_TAB' | 'NEW_WINDOW'

export type BackgroundRequest =
	| { type: 'panel.claim' }
	| { type: 'tab.info'; tabId?: number }
	| { type: 'tab.extract'; tabId?: number }
	| { type: 'tab.selection'; tabId?: number }
	| { type: 'tab.open'; url: string; newWindow?: boolean }
	| { type: 'search.query'; text: string; disposition: SearchDisposition }

export interface RequestResults {
	'panel.claim': { tabId: number | null }
	'tab.info': TabInfo
	'tab.extract': import('./extract/inject').InjectResult
	'tab.selection': { text: string }
	'tab.open': { tabId?: number }
	'search.query': { disposition: SearchDisposition }
}

export type BackgroundResponse =
	{ ok: true; value: unknown } | { ok: false; error: { kind: ErrorKind; message: string } }

export type BackgroundEvent =
	| { type: 'action.clicked'; tabId: number }
	| { type: 'tab.changed'; tabId: number | null; reason: 'activated' | 'updated' }
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
