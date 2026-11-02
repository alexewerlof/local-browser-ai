import { describe, expect, it } from 'vitest'
import { describeClock } from './clock'

const instant = new Date('2026-11-02T13:05:31.123Z')

describe('describeClock', () => {
	it('describes an instant in a named zone', () => {
		const clock = describeClock(instant, 'Europe/Berlin', 'en-GB')
		expect(clock.utc).toBe('2026-11-02T13:05:31.123Z')
		expect(clock.epochSeconds).toBe(1793624731)
		expect(clock.date).toBe('2026-11-02')
		expect(clock.time).toBe('14:05:31')
		expect(clock.local).toBe('2026-11-02T14:05:31+01:00')
		expect(clock.utcOffset).toBe('+01:00')
		expect(clock.weekday).toBe('Monday')
		expect(clock.weekdayLocal).toBe('Monday')
		expect(clock.timeZone).toBe('Europe/Berlin')
		expect(clock.human.length).toBeGreaterThan(0)
	})

	it('numbers the week with ISO 8601', () => {
		const clock = describeClock(instant, 'Europe/Berlin')
		expect(clock.isoWeek).toBe(45)
		expect(clock.isoWeekYear).toBe(2026)
	})

	it('keeps the week-based year when it differs from the calendar year', () => {
		// Reference values from Python's date.isocalendar().
		const newYear = describeClock(new Date('2027-01-01T12:00:00.000Z'), 'UTC')
		expect(newYear.date).toBe('2027-01-01')
		expect(newYear.isoWeek).toBe(53)
		expect(newYear.isoWeekYear).toBe(2026)

		const december = describeClock(new Date('2025-12-29T12:00:00.000Z'), 'UTC')
		expect(december.date).toBe('2025-12-29')
		expect(december.isoWeek).toBe(1)
		expect(december.isoWeekYear).toBe(2026)

		const leapDay = describeClock(new Date('2024-02-29T12:00:00.000Z'), 'UTC')
		expect(leapDay.isoWeek).toBe(9)
	})

	it('takes the week from the civil date in the zone, not from UTC', () => {
		// 00:30 UTC on a Monday is still Sunday in New York, one week earlier.
		const lateNight = new Date('2026-11-02T00:30:00.000Z')
		expect(describeClock(lateNight, 'UTC').isoWeek).toBe(45)
		const newYork = describeClock(lateNight, 'America/New_York')
		expect(newYork.date).toBe('2026-11-01')
		expect(newYork.isoWeek).toBe(44)
	})

	it('keeps the zone date at midnight and pads a half-hour offset', () => {
		const clock = describeClock(new Date('2026-03-08T00:00:00.000Z'), 'Asia/Kolkata')
		expect(clock.date).toBe('2026-03-08')
		expect(clock.time).toBe('05:30:00')
		expect(clock.utcOffset).toBe('+05:30')
		expect(clock.local).toBe('2026-03-08T05:30:00+05:30')
	})

	it('reports UTC with a zero offset', () => {
		const clock = describeClock(instant, 'UTC')
		expect(clock.local).toBe('2026-11-02T13:05:31+00:00')
		expect(clock.utcOffset).toBe('+00:00')
	})

	it('reports the calendar and clock the user actually reads', () => {
		// A Gregorian-only answer is wrong for a Thai user: their year is 2569.
		const thai = describeClock(instant, 'Asia/Bangkok', 'th-TH')
		expect(thai.calendar).toBe('buddhist')
		expect(thai.numberingSystem).toBe('latn')
		expect(thai.locale).toBe('th-TH')
		expect(thai.human).toContain('2569')
		// The machine fields stay Gregorian so the model can still do arithmetic.
		expect(thai.date).toBe('2026-11-02')
	})

	it('reports 12 and 24 hour conventions', () => {
		expect(describeClock(instant, 'UTC', 'en-US').hourCycle).toBe('h12')
		expect(describeClock(instant, 'UTC', 'de-DE').hourCycle).toBe('h23')
	})

	it('detects daylight saving time in both hemispheres', () => {
		const summer = new Date('2026-07-01T12:00:00.000Z')
		const winter = new Date('2026-01-15T12:00:00.000Z')
		expect(describeClock(summer, 'Europe/Berlin').dst).toBe('active')
		expect(describeClock(winter, 'Europe/Berlin').dst).toBe('inactive')
		expect(describeClock(summer, 'Australia/Sydney').dst).toBe('inactive')
		expect(describeClock(winter, 'Australia/Sydney').dst).toBe('active')
		expect(describeClock(summer, 'Asia/Kolkata').dst).toBe('none')
	})

	it('reports the first day of the week', () => {
		expect(describeClock(instant, 'UTC', 'en-US').weekStart).toBe(7)
		expect(describeClock(instant, 'UTC', 'de-DE').weekStart).toBe(1)
	})

	it('rejects an unknown zone', () => {
		expect(() => describeClock(instant, 'Mars/Olympus')).toThrow(RangeError)
	})
})
