/**
 * Put the tabs one chat's tools opened into a group of its own.
 *
 * The chrome-facing half of `core/tab-group.ts`. Chrome groups tabs in a second call, so
 * this runs from the panel right after a tab is known: the panel is what owns chats, and
 * doing it there means the browser harness exercises the real code instead of a copy.
 *
 * Nothing here asks for a site: grouping is a tab-strip arrangement, needs no permission
 * and no `tabGroups` access, and never touches a tab the user grouped themselves.
 */

import {
	groupFor,
	NO_TAB_GROUP,
	parseTabGroups,
	TAB_GROUPS_KEY,
	withGroup,
	type TabGroupRecord,
} from '../core/tab-group'
import { getChrome } from '../platform/chrome'
import { createSessionStore } from '../platform/storage'

const storage = createSessionStore()

/**
 * Writes are serialised through one chain: two tool calls in one step both find "no group
 * yet" and would otherwise create two groups for the same chat.
 */
let chain: Promise<unknown> = Promise.resolve()

function serialize<T>(task: () => Promise<T>): Promise<T> {
	const next = chain.then(task, task)
	// The chain must survive a failed step without swallowing it for the caller.
	chain = next.catch(() => {})
	return next
}

async function readRecords(): Promise<TabGroupRecord[]> {
	try {
		return parseTabGroups(await storage.get<unknown>(TAB_GROUPS_KEY, []))
	} catch {
		return []
	}
}

async function writeRecords(records: TabGroupRecord[]): Promise<void> {
	try {
		await storage.set(TAB_GROUPS_KEY, records)
	} catch {
		// Losing the map only costs a second group for the next tab.
	}
}

/** Ungrouped tabs report no group at all in some Chrome versions, and `-1` in others. */
function isUngrouped(tab: chrome.tabs.Tab): boolean {
	return tab.groupId === undefined || tab.groupId === NO_TAB_GROUP
}

/**
 * Group a tab the extension opened for `conversationId`.
 *
 * Best effort throughout: a browser without `tabs.group` (and the web harness) just does
 * nothing, and a tab the user has grouped themselves is left exactly where they put it.
 */
export function groupConversationTab(tabId: number, conversationId: string): Promise<void> {
	const chromeApi = getChrome()
	const group = chromeApi?.tabs?.group
	if (!chromeApi?.tabs || !group) return Promise.resolve()

	return serialize(async () => {
		try {
			const tab = await chromeApi.tabs.get(tabId)
			const records = await readRecords()
			const known = groupFor(records, conversationId, tab.windowId)

			// Already where it belongs, or where the user chose to put it.
			if (known !== undefined && tab.groupId === known) return
			if (!isUngrouped(tab)) return

			const groupId = known !== undefined && (await groupIsLive(chromeApi, known)) ? known : undefined
			const placed =
				groupId !== undefined
					? await group({ tabIds: [tabId], groupId }).catch(() => undefined)
					: await group({ tabIds: [tabId], createProperties: { windowId: tab.windowId } }).catch(
							() => undefined,
						)
			if (placed === undefined) return

			// A stale record for this chat and window is replaced, never kept beside the new
			// one: `withGroup` also drops any record naming the same group.
			await writeRecords(withGroup(records, { conversationId, windowId: tab.windowId, groupId: placed }))
		} catch (error) {
			// A tab that closed between the capture and this call, or a group the user
			// closed: neither is worth surfacing, and neither breaks the answer.
			console.warn('[lbai] could not group a tab', error)
		}
	})
}

/**
 * Whether a stored group id still names a group.
 *
 * `tabGroups.get` is the obvious check, but it needs the `tabGroups` permission — a group
 * with no tabs is deleted, so asking the tab list is enough and costs nothing extra.
 */
async function groupIsLive(chromeApi: typeof chrome, groupId: number): Promise<boolean> {
	try {
		return (await chromeApi.tabs.query({ groupId })).length > 0
	} catch {
		return false
	}
}
