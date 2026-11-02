/** Wall-clock snapshots for the model's `get_current_datetime` tool. */

export interface ClockSnapshot {
	/** UTC instant with milliseconds, e.g. `2026-11-02T13:05:31.123Z`. */
	utc: string
	/** The same instant as ISO 8601 with the zone's offset, e.g. `2026-11-02T14:05:31+01:00`. */
	local: string
	/** Calendar date in the zone, `YYYY-MM-DD`. */
	date: string
	/** 24-hour time in the zone, `HH:MM:SS`. */
	time: string
	/** English weekday name, e.g. `Monday`. */
	weekday: string
	/** IANA zone the snapshot was taken in. */
	timeZone: string
	/** Offset from UTC at this instant, e.g. `+01:00`. */
	utcOffset: string
	/** The same instant in the browser's locale, for quoting back to the user. */
	human: string
}

/** The zone the panel runs in, used when the model does not ask for one. */
export function localTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/**
 * Describe `now` in `timeZone` (an IANA name, defaulting to the local zone).
 *
 * Throws a `RangeError` for an unknown zone; the tool turns that into a message the
 * model can recover from.
 */
export function describeClock(now: Date = new Date(), timeZone: string = localTimeZone()): ClockSnapshot {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(now)

	const date = `${partValue(parts, 'year')}-${partValue(parts, 'month')}-${partValue(parts, 'day')}`
	const time = `${partValue(parts, 'hour')}:${partValue(parts, 'minute')}:${partValue(parts, 'second')}`

	const offsetLabel =
		new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
			.formatToParts(now)
			.find((part) => part.type === 'timeZoneName')?.value ?? ''
	const utcOffset = normalizeOffset(offsetLabel)

	return {
		utc: now.toISOString(),
		local: `${date}T${time}${utcOffset}`,
		date,
		time,
		weekday: new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(now),
		timeZone,
		utcOffset,
		human: new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: 'full', timeStyle: 'long' }).format(now),
	}
}

function partValue(parts: Intl.DateTimeFormatPart[], type: string): string {
	return parts.find((part) => part.type === type)?.value ?? ''
}

/** Turn `GMT+1`, `GMT+05:30` or `GMT` into a padded ISO offset such as `+01:00`. */
function normalizeOffset(label: string): string {
	const match = /^(?:GMT|UTC)?([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(label.trim())
	const sign = match?.[1]
	const hours = match?.[2]
	if (!sign || !hours) return '+00:00'
	return `${sign}${hours.padStart(2, '0')}:${match?.[3] ?? '00'}`
}
