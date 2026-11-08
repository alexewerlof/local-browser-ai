import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS_SECTION, SETTINGS_SECTIONS, parseSettingsHash, settingsSectionHash } from './settings-routes'

describe('parseSettingsHash', () => {
	it('loads the landing section from an empty fragment', () => {
		expect(parseSettingsHash('')).toBe(DEFAULT_SETTINGS_SECTION)
		expect(parseSettingsHash('#')).toBe(DEFAULT_SETTINGS_SECTION)
	})

	it('reads the canonical fragment of every section', () => {
		for (const section of SETTINGS_SECTIONS) {
			expect(parseSettingsHash(settingsSectionHash(section.id))).toBe(section.id)
		}
	})

	it('ignores the case of a hand-typed name', () => {
		expect(parseSettingsHash('#Skills')).toBe('skills')
	})

	it('falls back to the landing section for an unknown name', () => {
		expect(parseSettingsHash('#nope')).toBe(DEFAULT_SETTINGS_SECTION)
		// The slash form is not a route: it is just a name that matches no section.
		expect(parseSettingsHash('#/skills')).toBe(DEFAULT_SETTINGS_SECTION)
		expect(parseSettingsHash('#Skills/')).toBe(DEFAULT_SETTINGS_SECTION)
	})
})

describe('settingsSectionHash', () => {
	it('leaves the fragment off the landing section', () => {
		expect(settingsSectionHash('general')).toBe('')
	})

	it('names every other section', () => {
		expect(settingsSectionHash('skills')).toBe('#skills')
		expect(settingsSectionHash('tools')).toBe('#tools')
	})

	it('never emits the old slash form', () => {
		for (const section of SETTINGS_SECTIONS) {
			expect(settingsSectionHash(section.id)).not.toMatch(/^#\//)
		}
	})

	it('leads the rail with the landing section', () => {
		expect(SETTINGS_SECTIONS[0].id).toBe(DEFAULT_SETTINGS_SECTION)
	})
})
