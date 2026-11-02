import { describe, expect, it } from 'vitest'
import { describeClock } from './clock'

const instant = new Date('2026-11-02T13:05:31.123Z')

describe('describeClock', () => {
	it('describes an instant in a named zone', () => {
		const clock = describeClock(instant, 'Europe/Berlin')
		expect(clock.utc).toBe('2026-11-02T13:05:31.123Z')
		expect(clock.date).toBe('2026-11-02')
		expect(clock.time).toBe('14:05:31')
		expect(clock.local).toBe('2026-11-02T14:05:31+01:00')
		expect(clock.utcOffset).toBe('+01:00')
		expect(clock.weekday).toBe('Monday')
		expect(clock.timeZone).toBe('Europe/Berlin')
		expect(clock.human.length).toBeGreaterThan(0)
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

	it('rejects an unknown zone', () => {
		expect(() => describeClock(instant, 'Mars/Olympus')).toThrow(RangeError)
	})
})
