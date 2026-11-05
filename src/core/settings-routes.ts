/**
 * Which Settings section the page shows, and how that section is named in the URL.
 *
 * The page is a static extension file, so a path segment (`options.html/skills`) would need a
 * server to rewrite it. The slash lives in the fragment instead, mirroring Chrome's own
 * settings (`chrome://settings/performance`): General is the root, every other section is
 * `#/<id>`.
 */

export const SETTINGS_SECTIONS = [
	{ id: 'general', label: 'General' },
	{ id: 'providers', label: 'Providers' },
	{ id: 'models', label: 'Models' },
	{ id: 'skills', label: 'Skills' },
	{ id: 'tools', label: 'Built-in Tools' },
	{ id: 'mcp', label: 'MCP' },
	{ id: 'memory', label: 'Memory' },
	{ id: 'context', label: 'Context' },
] as const

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id']

/** The section the root URL opens. */
export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = 'general'

/**
 * The section a fragment names. Hand-typed URLs are tolerated (`#skills`, `#/Skills/`), and
 * anything unknown falls back to the landing section so a stale link opens a usable page.
 */
export function parseSettingsHash(hash: string): SettingsSectionId {
	const [path = ''] = hash.replace(/^#/, '').split('?')
	const name = path.replace(/^\/+|\/+$/g, '').toLowerCase()
	if (!name) return DEFAULT_SETTINGS_SECTION
	const match = SETTINGS_SECTIONS.find((section) => section.id === name)
	return match ? match.id : DEFAULT_SETTINGS_SECTION
}

/** The canonical fragment for a section: `#/` for the landing section, else `#/<id>`. */
export function settingsSectionHash(section: SettingsSectionId): string {
	return section === DEFAULT_SETTINGS_SECTION ? '#/' : `#/${section}`
}
