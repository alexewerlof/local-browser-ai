/**
 * The maths behind the composer's resize line, kept out of `Composer.tsx` so both ends of a
 * drag can be tested without a browser: the component measures the DOM, this decides.
 */

/**
 * The least transcript that stays on screen when the composer is dragged to its maximum. A
 * constant rather than a share of the panel: the point of the ceiling is that the answer
 * being read is still there, and on a short panel a percentage would take that away.
 */
export const MIN_TRANSCRIPT_HEIGHT = 96

/** One press of an arrow key on the focused line. */
export const RESIZE_STEP = 16

/** A pointer that moves less than this is a click on the line, not a drag. */
export const DRAG_THRESHOLD = 2

/**
 * Two clicks on the line inside this window are the reset gesture. Timed here rather than
 * read off a `dblclick` event, because the pointer is captured and its default prevented on
 * `pointerdown` — which is what keeps a drag from taking the caret out of the prompt.
 */
export const DOUBLE_CLICK_MS = 350

/** What the component reads off the DOM when a gesture starts. */
export interface ComposerMeasurements {
	/** The composer's height at the moment of measuring. */
	height: number
	/** The textarea's height: it is the row that gives way, so the rest is fixed chrome. */
	promptHeight: number
	/** The textarea's own minimum (three lines), which is the floor the prompt may not lose. */
	promptFloor: number
	/** The room above the composer, which the ceiling shares with the sliver. */
	transcriptHeight: number
}

/** Where a drag may stop, in pixels. */
export interface ComposerLimits {
	min: number
	max: number
}

/**
 * The composer is anchored to the bottom of the panel, so a pointer moving up — a negative
 * `dy` — makes it taller.
 */
export function composerHeightFromDrag(startHeight: number, dy: number): number {
	return startHeight - dy
}

/**
 * Both ends of a drag. The floor leaves every row that is not the prompt at its natural
 * height — a queued prompt, an error line — and the prompt at its own minimum, so no control
 * can be pushed out of the panel; the ceiling keeps
 * `MIN_TRANSCRIPT_HEIGHT` of the conversation on screen whatever the panel's size.
 */
export function composerLimits({
	height,
	promptHeight,
	promptFloor,
	transcriptHeight,
}: ComposerMeasurements): ComposerLimits {
	const min = Math.max(0, height - promptHeight + promptFloor)
	const max = Math.max(min, height + Math.max(0, transcriptHeight) - MIN_TRANSCRIPT_HEIGHT)
	return { min, max }
}

/** Keeps a height between the two ends, preferring the floor if they have crossed. */
export function clampComposerHeight(desired: number, { min, max }: ComposerLimits): number {
	if (max < min) return min
	return Math.min(Math.max(desired, min), max)
}

/**
 * The height a composer takes when the rows above the prompt change height. Anything that
 * appears there — the page band opening its list, a queued prompt, an error line — is paid
 * for by the transcript, because the prompt keeps the height the user gave it. So the
 * composer grows upward by exactly that much, and gives it back when the row goes away.
 *
 * `floor` is the height that leaves the prompt at its own minimum, measured after the
 * change, and `ceiling` the most the panel can hold. The growth may pass the usual ceiling
 * (the transcript sliver): a row the user just opened should not be hidden behind the
 * conversation. It may never eat the prompt, and it may never spill out of the panel —
 * when the two disagree, the prompt wins.
 */
export function composerHeightForChrome(height: number, chromeDelta: number, floor: number, ceiling: number): number {
	return Math.min(Math.max(height + chromeDelta, floor), Math.max(floor, ceiling))
}

/** Whether the click just ended is the second of a pair, i.e. the reset gesture. */
export function isResetGesture(previousClickAt: number, clickAt: number): boolean {
	return previousClickAt > 0 && clickAt - previousClickAt <= DOUBLE_CLICK_MS
}
