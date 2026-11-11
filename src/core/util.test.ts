import { describe, expect, it } from 'vitest'
import { stampIso, stampTime, stampTooltip } from './util'

/** A fixed "now": 11 November 2026, mid-afternoon, in the runtime's own zone. */
const REFERENCE = new Date(2026, 10, 11, 15, 30).getTime()

function timeOf(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString(undefined, {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	})
}

function dateOf(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

describe('stampTime', () => {
	it('is the clock time, to the second, for a page captured today', () => {
		const at = new Date(2026, 10, 11, 9, 14, 7).getTime()
		const stamp = stampTime(at, REFERENCE)
		expect(stamp).toBe(timeOf(at))
		// Seconds are the point: two captures of one page can be a minute apart.
		expect(stamp.split(':')).toHaveLength(3)
		// No date at all: every page added today would repeat it.
		expect(stamp).not.toContain(',')
	})

	it('never says how long ago, so an open list cannot go stale', () => {
		const at = REFERENCE - 90_000
		const stamp = stampTime(at, REFERENCE)
		expect(stamp).toBe(timeOf(at))
		expect(stamp).not.toMatch(/ago|now|just/i)
		// The same row an hour later reads the same, not "1 hour ago".
		expect(stampTime(at, REFERENCE + 3_600_000)).toBe(stamp)
	})

	it('adds the date on another calendar day, before the time', () => {
		const earlier = new Date(2026, 10, 8, 9, 14, 7).getTime()
		const stamp = stampTime(earlier, REFERENCE)
		expect(stamp).toBe(`${dateOf(earlier)}, ${timeOf(earlier)}`)
		// Same year as now, so the year would be redundant.
		expect(stamp).not.toContain('2026')
	})

	it('adds the year only when it differs', () => {
		expect(stampTime(new Date(2025, 10, 9, 9, 14).getTime(), REFERENCE)).toContain('2025')
	})

	it('decides by calendar day, not by 24 hours', () => {
		// Half an hour ago but yesterday: the date has to be there.
		const lateYesterday = new Date(2026, 10, 10, 23, 50).getTime()
		const justAfterMidnight = new Date(2026, 10, 11, 0, 20).getTime()
		expect(stampTime(lateYesterday, justAfterMidnight)).toBe(`${dateOf(lateYesterday)}, ${timeOf(lateYesterday)}`)
	})

	it('renders nothing for a timestamp that is not a date', () => {
		expect(stampTime(Number.NaN, REFERENCE)).toBe('')
	})
})

describe('stampIso', () => {
	it('gives the machine-readable instant for the time element', () => {
		const at = new Date(2026, 10, 11, 9, 14, 7)
		expect(stampIso(at.getTime())).toBe(at.toISOString())
	})

	it('stays quiet for a timestamp it cannot name', () => {
		// `toISOString` throws on an invalid date, and a stored page may predate the field.
		expect(stampIso(Number.NaN)).toBeUndefined()
	})
})

describe('stampTooltip', () => {
	it('spells the whole instant out in the user’s locale', () => {
		const at = new Date(2026, 10, 8, 9, 14, 7)
		const tooltip = stampTooltip(at.getTime())
		const expected = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long' }).format(at)
		expect(tooltip).toBe(expected)
		// A full date means the year and the weekday are there, not just "Nov 8".
		expect(tooltip).toContain('2026')
	})

	it('stays quiet for a timestamp it cannot name', () => {
		expect(stampTooltip(Number.NaN)).toBeUndefined()
	})
})
