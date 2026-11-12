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
		expect(parseSettingsHash('#Templates')).toBe('templates')
	})

	it('falls back to the landing section for an unknown name', () => {
		expect(parseSettingsHash('#nope')).toBe(DEFAULT_SETTINGS_SECTION)
		// The slash form is not a route: it is just a name that matches no section.
		expect(parseSettingsHash('#/nope')).toBe(DEFAULT_SETTINGS_SECTION)
		expect(parseSettingsHash('#Nope/')).toBe(DEFAULT_SETTINGS_SECTION)
	})

	it('lands a retired section on the one that absorbed it', () => {
		expect(parseSettingsHash('#models')).toBe('providers')
		expect(parseSettingsHash('#mcp')).toBe('tools')
		// The page was called Skills, then Prompt templates, before its caption was shortened.
		expect(parseSettingsHash('#skills')).toBe('templates')
		expect(parseSettingsHash('#Skills')).toBe('templates')
		expect(parseSettingsHash('#prompt-templates')).toBe('templates')
		expect(parseSettingsHash('#Prompt-Templates')).toBe('templates')
	})
})

describe('settingsSectionHash', () => {
	it('leaves the fragment off the landing section', () => {
		expect(settingsSectionHash('general')).toBe('')
	})

	it('names every other section', () => {
		expect(settingsSectionHash('templates')).toBe('#templates')
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
