/**
 * Which browser tab group holds the tabs one chat's tools opened.
 *
 * Chrome cannot name a group when it creates a tab: `tabs.create` takes no group, so
 * grouping is a second call (`tabs.group`) and the id it returns only means anything for
 * the rest of the browser session. The map therefore lives in session storage, and every
 * id read back from it is treated as a hint that has to be verified — a group whose last
 * tab was closed disappears, while the record stays until the next tab replaces it.
 *
 * One record per chat **and window**: a group cannot span windows, so a chat whose tabs
 * ended up in two of them has two groups. That is still 1:1 as the user sees it — one chat,
 * its own groups — rather than a chat's tabs mixed into somebody else's group.
 */

export const TAB_GROUPS_KEY = 'tab-groups.v1'

/**
 * `chrome.tabGroups.TAB_GROUP_ID_NONE`. The constant itself is readable without the
 * `tabGroups` permission, but this module must not reach for that namespace: naming a
 * group is the user's decision, and nothing here needs it.
 */
export const NO_TAB_GROUP = -1

export interface TabGroupRecord {
	conversationId: string
	windowId: number
	groupId: number
}

function isRecord(value: unknown): value is TabGroupRecord {
	if (typeof value !== 'object' || value === null) return false
	const record = value as Record<string, unknown>
	return (
		typeof record.conversationId === 'string' &&
		record.conversationId !== '' &&
		typeof record.windowId === 'number' &&
		typeof record.groupId === 'number' &&
		record.groupId !== NO_TAB_GROUP
	)
}

/** Whatever was stored, as records this app can use. A corrupted entry is simply dropped. */
export function parseTabGroups(value: unknown): TabGroupRecord[] {
	return Array.isArray(value) ? value.filter(isRecord) : []
}

/** The group this chat's tabs use in that window, if it ever created one there. */
export function groupFor(
	records: readonly TabGroupRecord[],
	conversationId: string,
	windowId: number,
): number | undefined {
	return records.find((record) => record.conversationId === conversationId && record.windowId === windowId)?.groupId
}

/**
 * Point one chat's window at `groupId`.
 *
 * Replaces the record for the same chat and window, and drops any other record naming the
 * group: a group id that came back from the dead would otherwise hand a chat tabs it never
 * opened.
 */
export function withGroup(records: readonly TabGroupRecord[], record: TabGroupRecord): TabGroupRecord[] {
	return [
		...records.filter(
			(entry) =>
				entry.groupId !== record.groupId &&
				!(entry.conversationId === record.conversationId && entry.windowId === record.windowId),
		),
		record,
	]
}

/** Forget a group that no longer exists, so the next tab starts a fresh one. */
export function withoutGroup(records: readonly TabGroupRecord[], groupId: number): TabGroupRecord[] {
	return records.filter((record) => record.groupId !== groupId)
}
