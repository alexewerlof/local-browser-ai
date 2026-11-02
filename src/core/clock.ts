/** Wall-clock and locale snapshots for the model's `get_current_datetime` tool. */

/** Whether the zone is on daylight saving time right now; `none` means it never observes it. */
export type DstState = 'active' | 'inactive' | 'none'

export interface ClockSnapshot {
	/** UTC instant with milliseconds, e.g. `2026-11-02T13:05:31.123Z`. */
	utc: string
	/** Unix time in whole seconds, e.g. `1793624731`. */
	epochSeconds: number
	/** The same instant as ISO 8601 with the zone's offset, e.g. `2026-11-02T14:05:31+01:00`. */
	local: string
	/** Gregorian date in the zone, `YYYY-MM-DD`, whatever calendar the user reads. */
	date: string
	/** ISO 8601 week number of `date`, 1-53. */
	isoWeek: number
	/** ISO week-based year of `date`; differs from the calendar year around New Year. */
	isoWeekYear: number
	/** 24-hour time in the zone, `HH:MM:SS`. */
	time: string
	/** English weekday name, e.g. `Monday`, for reasoning. */
	weekday: string
	/** Weekday in the user's locale, e.g. `Montag`. */
	weekdayLocal: string
	/** IANA zone the snapshot was taken in. */
	timeZone: string
	/** Offset from UTC at this instant, e.g. `+01:00`. */
	utcOffset: string
	/** Date and time in the user's locale and calendar, for quoting back to the user. */
	human: string
	/** The user's locale, e.g. `de-DE`. */
	locale: string
	/** Calendar the user reads dates in: `gregory`, `buddhist`, `persian`, ... */
	calendar: string
	/** Digits the user reads: `latn`, `arab`, `arabext`, ... */
	numberingSystem: string
	/** Clock convention the user expects: `h12` (2pm) or `h23` (14:00). */
	hourCycle: string
	/** Whether the zone is on daylight saving time right now, and whether it ever uses it. */
	dst: DstState
	/** First day of the week, 1 = Monday ... 7 = Sunday. Absent without `Intl.Locale` week info. */
	weekStart?: number
}

interface LocalePreferences {
	locale: string
	calendar: string
	numberingSystem: string
	hourCycle: string
}

/** The zone the panel runs in, used when the model does not ask for one. */
export function localTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/**
 * Describe `now` in `timeZone` (an IANA name, defaulting to the local zone), presented
 * with the preferences of `locale` (defaulting to the runtime locale).
 *
 * The machine fields (`utc`, `local`, `date`, `time`) stay Gregorian and ASCII so the
 * model can do arithmetic; the locale fields say how the user actually reads them.
 *
 * Throws a `RangeError` for an unknown zone; the tool turns that into a message the
 * model can recover from.
 */
export function describeClock(
	now: Date = new Date(),
	timeZone: string = localTimeZone(),
	locale?: string,
): ClockSnapshot {
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

	const utcOffset = zoneOffset(now, timeZone)
	const prefs = preferences(locale)
	const week = isoWeekOf(date)

	return {
		utc: now.toISOString(),
		epochSeconds: Math.floor(now.getTime() / 1000),
		local: `${date}T${time}${utcOffset}`,
		date,
		isoWeek: week.isoWeek,
		isoWeekYear: week.isoWeekYear,
		time,
		weekday: new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(now),
		weekdayLocal: new Intl.DateTimeFormat(prefs.locale, { timeZone, weekday: 'long' }).format(now),
		timeZone,
		utcOffset,
		human: new Intl.DateTimeFormat(prefs.locale, { timeZone, dateStyle: 'full', timeStyle: 'long' }).format(now),
		locale: prefs.locale,
		calendar: prefs.calendar,
		numberingSystem: prefs.numberingSystem,
		hourCycle: prefs.hourCycle,
		dst: dstState(now, timeZone),
		weekStart: weekStart(prefs.locale),
	}
}

function partValue(parts: Intl.DateTimeFormatPart[], type: string): string {
	return parts.find((part) => part.type === type)?.value ?? ''
}

/**
 * ISO 8601 week of a civil date. The week containing the year's first Thursday is week 1,
 * so the week-based year can be one either side of the calendar year.
 */
function isoWeekOf(civilDate: string): { isoWeek: number; isoWeekYear: number } {
	const [year, month, day] = civilDate.split('-').map(Number)
	const thursday = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1))
	const weekday = thursday.getUTCDay() || 7 // Monday = 1 ... Sunday = 7
	// Move to the Thursday of this week: its year is the week-year by definition.
	thursday.setUTCDate(thursday.getUTCDate() + 4 - weekday)
	const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1)
	const dayOfYear = (thursday.getTime() - yearStart) / 86_400_000 + 1
	return { isoWeek: Math.ceil(dayOfYear / 7), isoWeekYear: thursday.getUTCFullYear() }
}

/** Locale, calendar and clock conventions the user reads dates in. */
function preferences(locale?: string): LocalePreferences {
	// `hourCycle` is only reported when the formatter actually formats a time.
	const resolved = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: 'numeric' }).resolvedOptions()
	return {
		locale: resolved.locale || 'en',
		calendar: resolved.calendar || 'gregory',
		numberingSystem: resolved.numberingSystem || 'latn',
		hourCycle: resolved.hourCycle || (resolved.hour12 === false ? 'h23' : 'h12'),
	}
}

/** Whether the zone is on DST right now, and whether it ever uses it. */
function dstState(now: Date, timeZone: string): DstState {
	const year = Number(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(now))
	const january = offsetMinutes(zoneOffset(new Date(Date.UTC(year, 0, 1)), timeZone))
	const july = offsetMinutes(zoneOffset(new Date(Date.UTC(year, 6, 1)), timeZone))
	// Equal offsets all year means the zone has no DST at all.
	if (january === july) return 'none'
	// DST always shifts the clock forward, in either hemisphere, so the larger
	// offset is the summer one and the smaller one is standard time.
	return offsetMinutes(zoneOffset(now, timeZone)) > Math.min(january, july) ? 'active' : 'inactive'
}

/** First day of the week for a locale, 1 = Monday ... 7 = Sunday. */
function weekStart(locale: string): number | undefined {
	try {
		const resolved = new Intl.Locale(locale) as Intl.Locale & {
			weekInfo?: { firstDay?: number }
			getWeekInfo?: () => { firstDay?: number }
		}
		return resolved.weekInfo?.firstDay ?? resolved.getWeekInfo?.().firstDay
	} catch {
		return undefined
	}
}

function zoneOffset(date: Date, timeZone: string): string {
	const label =
		new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
			.formatToParts(date)
			.find((part) => part.type === 'timeZoneName')?.value ?? ''
	return normalizeOffset(label)
}

function offsetMinutes(offset: string): number {
	const sign = offset.startsWith('-') ? -1 : 1
	const [hours, minutes] = offset.slice(1).split(':')
	return sign * (Number(hours) * 60 + Number(minutes || 0))
}

/** Turn `GMT+1`, `GMT+05:30` or `GMT` into a padded ISO offset such as `+01:00`. */
function normalizeOffset(label: string): string {
	const match = /^(?:GMT|UTC)?([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(label.trim())
	const sign = match?.[1]
	const hours = match?.[2]
	if (!sign || !hours) return '+00:00'
	return `${sign}${hours.padStart(2, '0')}:${match?.[3] ?? '00'}`
}
