import { describe, expect, it } from 'vitest'
import { groupFor, NO_TAB_GROUP, parseTabGroups, withGroup, withoutGroup, type TabGroupRecord } from './tab-group'

const record = (conversationId: string, windowId: number, groupId: number): TabGroupRecord => ({
	conversationId,
	windowId,
	groupId,
})

describe('parseTabGroups', () => {
	it('drops everything it cannot use instead of failing the whole map', () => {
		const parsed = parseTabGroups([
			record('chat-a', 1, 7),
			{ conversationId: 'chat-b', windowId: 1 },
			{ conversationId: '', windowId: 1, groupId: 9 },
			{ conversationId: 'chat-c', windowId: '1', groupId: 9 },
			// A record naming "no group" would read as a real id.
			record('chat-d', 1, NO_TAB_GROUP),
			null,
			'a string',
		])
		expect(parsed).toEqual([record('chat-a', 1, 7)])
	})

	it('reads a value that is not a list as an empty map', () => {
		expect(parseTabGroups(undefined)).toEqual([])
		expect(parseTabGroups({ conversationId: 'chat-a' })).toEqual([])
	})
})

describe('groupFor', () => {
	const records = [record('chat-a', 1, 7), record('chat-a', 2, 8), record('chat-b', 1, 9)]

	it('answers per chat and window, because a group cannot span windows', () => {
		expect(groupFor(records, 'chat-a', 1)).toBe(7)
		expect(groupFor(records, 'chat-a', 2)).toBe(8)
		expect(groupFor(records, 'chat-b', 1)).toBe(9)
	})

	it('has no answer for a chat or a window that never opened a tab', () => {
		expect(groupFor(records, 'chat-c', 1)).toBeUndefined()
		expect(groupFor(records, 'chat-a', 3)).toBeUndefined()
	})
})

describe('withGroup', () => {
	it('replaces the record of the chat and window it is given', () => {
		const records = [record('chat-a', 1, 7), record('chat-b', 1, 9)]
		const next = withGroup(records, record('chat-a', 1, 10))
		expect(groupFor(next, 'chat-a', 1)).toBe(10)
		// The other chat is untouched, and nothing else points at the old group.
		expect(groupFor(next, 'chat-b', 1)).toBe(9)
		expect(next.some((entry) => entry.groupId === 7)).toBe(false)
	})

	it('drops another record that names the same group', () => {
		const next = withGroup([record('chat-a', 1, 7)], record('chat-b', 2, 7))
		expect(next).toEqual([record('chat-b', 2, 7)])
	})

	it('does not mutate the list it was given', () => {
		const records = [record('chat-a', 1, 7)]
		withGroup(records, record('chat-a', 1, 8))
		expect(records).toEqual([record('chat-a', 1, 7)])
	})
})

describe('withoutGroup', () => {
	it('forgets every chat pointing at a group that is gone', () => {
		const next = withoutGroup([record('chat-a', 1, 7), record('chat-b', 1, 9)], 7)
		expect(next).toEqual([record('chat-b', 1, 9)])
	})
})
