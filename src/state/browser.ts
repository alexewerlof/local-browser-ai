import type { PageAttachment } from '../core/types'
import { Store } from '../core/store'
import { claimTab, extractTab, getTabInfo, onBackgroundEvent } from '../browser/client'
import { processExtraction } from '../browser/extract/pipeline'
import type { TabInfo } from '../browser/protocol'

/** The tab the current attachment came from. */
export const tabIdStore = new Store<number | null>(null)
/** Mirror of the conversation's attachment, so tools can read it without importing chat state. */
export const attachmentStore = new Store<PageAttachment | null>(null)
export const tabInfoStore = new Store<TabInfo | null>(null)

export interface PendingApproval {
	id: string
	toolName: string
	input: unknown
	resolve: (approved: boolean) => void
}

export const approvalsStore = new Store<PendingApproval[]>([])

export function requestApproval(
	toolCallId: string,
	toolName: string,
	input: unknown,
	signal?: AbortSignal,
): Promise<boolean> {
	if (signal?.aborted) return Promise.resolve(false)
	return new Promise<boolean>((resolve) => {
		const settle = (approved: boolean) => {
			approvalsStore.set((current) => current.filter((entry) => entry.id !== toolCallId))
			resolve(approved)
		}
		approvalsStore.set((current) => [
			...current.filter((entry) => entry.id !== toolCallId),
			{ id: toolCallId, toolName, input, resolve: settle },
		])
		signal?.addEventListener('abort', () => settle(false), { once: true })
	})
}

export function resolveApproval(toolCallId: string, approved: boolean): void {
	const entry = approvalsStore.get().find((candidate) => candidate.id === toolCallId)
	entry?.resolve(approved)
}

/** Extract a tab into a page attachment, throwing a typed error on failure. */
export async function extractFromTab(tabId?: number): Promise<{ attachment: PageAttachment; info: TabInfo }> {
	const info = await getTabInfo(tabId)
	const result = await extractTab(info.id)
	const attachment = processExtraction(result)
	if (!attachment.faviconUrl) attachment.faviconUrl = info.faviconUrl
	if (!attachment.title) attachment.title = info.title
	tabIdStore.set(info.id)
	tabInfoStore.set(info)
	attachmentStore.set(attachment)
	return { attachment, info }
}

/** Claim the tab the user invoked the extension on (toolbar click or context menu). */
export async function claimClickedTab(): Promise<{ attachment: PageAttachment; info: TabInfo } | null> {
	const tabId = await claimTab()
	if (tabId === null) return null
	return extractFromTab(tabId)
}

export function clearTab(): void {
	tabIdStore.set(null)
	tabInfoStore.set(null)
	attachmentStore.set(null)
}

export interface BrowserEventHandlers {
	onAttachRequested: () => void
	onSelection: (text: string) => void
	onTabChanged: (reason: 'activated' | 'updated') => void
}

/** Wire background events into the app. Returns an unsubscribe function. */
export function initBrowserEvents(handlers: BrowserEventHandlers): () => void {
	return onBackgroundEvent((event) => {
		switch (event.type) {
			case 'action.clicked':
				handlers.onAttachRequested()
				break
			case 'selection.add':
				handlers.onSelection(event.text)
				break
			case 'tab.changed': {
				const attached = tabIdStore.get()
				if (attached === null) return
				if (event.tabId !== null && event.tabId !== attached) {
					handlers.onTabChanged('activated')
					return
				}
				if (event.reason === 'updated') handlers.onTabChanged('updated')
				break
			}
		}
	})
}
