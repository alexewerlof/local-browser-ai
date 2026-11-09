/**
 * Which Settings section the page shows, and how that section is named in the URL.
 *
 * The page is a static extension file and Chrome's extension loader opens a URL path verbatim
 * as a file, so a path segment (`settings/models`) can never resolve — there is no rewrite
 * layer to map it back to `settings.html`. The fragment is the only part of the URL the loader
 * leaves alone, so the section lives there: General is the bare page, every other section is
 * `#<id>` (`settings.html#models`).
 */

export const SETTINGS_SECTIONS = [
	{ id: 'general', label: 'General' },
	{ id: 'appearance', label: 'Appearance' },
	{ id: 'providers', label: 'Providers' },
	{ id: 'models', label: 'Models' },
	{ id: 'skills', label: 'Skills' },
	{ id: 'tools', label: 'Tools' },
	{ id: 'memory', label: 'Memory' },
	{ id: 'context', label: 'Context' },
] as const

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id']

/** The section the bare page (no fragment) opens. */
export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = 'general'

/**
 * Fragments that named a section which has since merged into another one. `#mcp` was its
 * own page until MCP servers joined Built-in Tools under `#tools`; a bookmark or the gear
 * of an older build still has to land somewhere useful.
 */
const SECTION_ALIASES: Record<string, SettingsSectionId> = {
	mcp: 'tools',
}

/**
 * The section a fragment names. The id is matched case-insensitively, and anything unknown —
 * including an empty fragment — falls back to the landing section so a mistyped URL opens a
 * usable page.
 */
export function parseSettingsHash(hash: string): SettingsSectionId {
	const name = hash.replace(/^#/, '').toLowerCase()
	const match = SETTINGS_SECTIONS.find((section) => section.id === name)
	if (match) return match.id
	return SECTION_ALIASES[name] ?? DEFAULT_SETTINGS_SECTION
}

/** The canonical fragment for a section: empty for the landing section, else `#<id>`. */
export function settingsSectionHash(section: SettingsSectionId): string {
	return section === DEFAULT_SETTINGS_SECTION ? '' : `#${section}`
}
