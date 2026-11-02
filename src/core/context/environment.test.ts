import { describe, expect, it } from 'vitest'
import { browserLanguages, describeEnvironment } from './environment'

describe('describeEnvironment', () => {
	it('names the browser language preferences', () => {
		const text = describeEnvironment({ languages: ['de-DE', 'en'] })
		expect(text).toContain('de-DE, en')
		expect(text).toMatch(/Answer in the language/)
	})

	it('caps the list so the line stays short', () => {
		const text = describeEnvironment({ languages: ['fr-FR', 'en-GB', 'de-DE', 'es-ES', 'it-IT'] })
		expect(text).toContain('fr-FR, en-GB, de-DE')
		expect(text).not.toContain('es-ES')
	})

	it('adds the page language when a page is attached', () => {
		const text = describeEnvironment({ languages: ['en-US'], pageLanguage: 'fr-CA' })
		expect(text).toContain('"fr-CA"')
		expect(text.split('\n')).toHaveLength(2)
	})

	it('stays quiet when the page is in a language the user already prefers', () => {
		const text = describeEnvironment({ languages: ['en-GB', 'de-DE'], pageLanguage: 'en' })
		expect(text.split('\n')).toHaveLength(1)
	})

	it('returns an empty string when nothing is known', () => {
		expect(describeEnvironment({ languages: [] })).toBe('')
	})

	it('reads the browser languages by default', () => {
		const languages = browserLanguages()
		expect(Array.isArray(languages)).toBe(true)
	})
})
