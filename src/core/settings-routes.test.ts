import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS_SECTION, SETTINGS_SECTIONS, parseSettingsHash, settingsSectionHash } from './settings-routes'

describe('parseSettingsHash', () => {
	it('does not load a core module for the landing section on an empty fragment', () => {
		expect(parseSettingsHash('')).toBe(DEFAULT_SETTINGS_SECTION)
		expect(parseSettingsHash('#')).toBe(DEFAULT_SETTINGS_SECTION)
		expect(parseSettingsHash('#/')).toBe(DEFAULT_SETTINGS_SECTION)
	})

	it('reads the canonical fragment of every section', () => {
		for (const section of SETTINGS_SECTIONS) {
			expect(parseSettingsHash(settingsSectionHash(section.id))).toBe(section.id)
		}
	})

	it('tolerates hand-typed variants', () => {
		expect(parseSettingsHash('#skills')).toBe('skills')
		expect(parseSettingsHash('#/Skills')).toBe('skills')
		expect(parseSettingsHash('#/skills/')).toBe('skills')
		expect(parseSettingsHash('#//skills')).toBe('skills')
	})

	it('falls back to the landing section for an unknown name', () => {
		expect(parseSettingsHash('#/nope')).toBe(DEFAULT_SETTINGS_SECTION)
		expect(parseSettingsHash('#/skills?foo')).toBe('skills')
	})
})

describe('settingsSectionHash', () => {
	it('uses the root fragment for the landing section', () => {
		expect(settingsSectionHash('general')).toBe('#/')
	})

	it('names every other section', () => {
		expect(settingsSectionHash('skills')).toBe('#/skills')
		expect(settingsSectionHash('tools')).toBe('#/tools')
	})

	it('leads the rail with the landing section', () => {
		expect(SETTINGS_SECTIONS[0].id).toBe(DEFAULT_SETTINGS_SECTION)
	})
})
