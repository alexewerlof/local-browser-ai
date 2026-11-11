import { describe, expect, it } from 'vitest'
import {
	DOUBLE_CLICK_MS,
	DRAG_THRESHOLD,
	MIN_TRANSCRIPT_HEIGHT,
	RESIZE_STEP,
	clampComposerHeight,
	composerHeightFromDrag,
	composerLimits,
	isResetGesture,
} from './composer-size'

describe('composerHeightFromDrag', () => {
	it('grows when the pointer moves up', () => {
		expect(composerHeightFromDrag(200, -120)).toBe(320)
	})

	it('shrinks when the pointer moves down', () => {
		expect(composerHeightFromDrag(200, 80)).toBe(120)
	})

	it('holds still when the pointer does not move', () => {
		expect(composerHeightFromDrag(200, 0)).toBe(200)
	})
})

describe('composerLimits', () => {
	it('keeps the floor at one prompt line above the fixed chrome', () => {
		// The textarea is 160px of a 320px composer, so 160px is chrome the prompt cannot eat.
		const { min } = composerLimits({
			height: 320,
			promptHeight: 160,
			promptFloor: 40,
			transcriptHeight: 600,
		})
		expect(min).toBe(200)
	})

	it('raises the floor as rows appear above the prompt', () => {
		// A queued prompt and the page list make the chrome taller, so the floor rises with it.
		const { min } = composerLimits({
			height: 380,
			promptHeight: 160,
			promptFloor: 40,
			transcriptHeight: 600,
		})
		expect(min).toBe(260)
	})

	it('keeps a sliver of transcript at the ceiling', () => {
		const { max } = composerLimits({
			height: 320,
			promptHeight: 160,
			promptFloor: 40,
			transcriptHeight: 600,
		})
		expect(max).toBe(320 + 600 - MIN_TRANSCRIPT_HEIGHT)
	})

	it('never puts the ceiling below the floor', () => {
		// A prompt with less than the sliver's worth of give-way room: the transcript can
		// contribute nothing, so the floor is the answer rather than a negative range.
		const { min, max } = composerLimits({
			height: 320,
			promptHeight: 60,
			promptFloor: 40,
			transcriptHeight: 6,
		})
		expect(min).toBe(300)
		expect(max).toBe(min)
	})

	it('treats a negative transcript as no room above the composer', () => {
		const { max } = composerLimits({
			height: 400,
			promptHeight: 160,
			promptFloor: 40,
			transcriptHeight: -50,
		})
		expect(max).toBe(400 - MIN_TRANSCRIPT_HEIGHT)
	})
})

describe('clampComposerHeight', () => {
	const limits = { min: 200, max: 700 }

	it('leaves a height inside the range alone', () => {
		expect(clampComposerHeight(400, limits)).toBe(400)
	})

	it('stops at the floor', () => {
		expect(clampComposerHeight(40, limits)).toBe(200)
	})

	it('stops at the ceiling', () => {
		expect(clampComposerHeight(2000, limits)).toBe(700)
	})

	it('prefers the floor when the ends have crossed', () => {
		expect(clampComposerHeight(500, { min: 300, max: 200 })).toBe(300)
	})
})

describe('the constants', () => {
	it('leaves a usable sliver and a step that is smaller than an arrow-key jump', () => {
		expect(MIN_TRANSCRIPT_HEIGHT).toBeGreaterThanOrEqual(80)
		expect(RESIZE_STEP).toBeLessThan(MIN_TRANSCRIPT_HEIGHT)
		expect(DRAG_THRESHOLD).toBeGreaterThan(0)
	})
})

describe('isResetGesture', () => {
	it('is not a reset for the first click', () => {
		expect(isResetGesture(0, 1_000)).toBe(false)
	})

	it('is a reset for a click inside the window', () => {
		expect(isResetGesture(1_000, 1_000 + DOUBLE_CLICK_MS)).toBe(true)
	})

	it('is two separate clicks once the window has passed', () => {
		expect(isResetGesture(1_000, 1_000 + DOUBLE_CLICK_MS + 1)).toBe(false)
	})
})
