import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8')) as {
	manifest_version: number
	permissions: string[]
	host_permissions: string[]
	optional_host_permissions: string[]
	background: { service_worker: string; type: string }
	side_panel: { default_path: string }
	options_ui: { page: string; open_in_tab: boolean }
	content_security_policy: { extension_pages: string }
	action: Record<string, unknown>
	icons: Record<string, string>
}

describe('manifest', () => {
	it('is a Manifest V3 extension', () => {
		expect(manifest.manifest_version).toBe(3)
	})

	it('requests only the permissions the app uses', () => {
		expect(new Set(manifest.permissions)).toEqual(
			new Set(['sidePanel', 'scripting', 'activeTab', 'tabs', 'contextMenus', 'storage', 'search']),
		)
	})

	it('reads tab URLs so Settings is opened once and then focused', () => {
		// `tabs` is what makes `tabs.query()` return `url`, which `openOptionsPage` matches on.
		expect(manifest.permissions).toContain('tabs')
	})

	it('grants tab access through activeTab, not broad host permissions', () => {
		expect(manifest.permissions).toContain('activeTab')
		for (const host of manifest.host_permissions) {
			expect(host).toMatch(/^http:\/\/(localhost|127\.0\.0\.1)\//)
		}
		expect(manifest.optional_host_permissions).toEqual(['http://*/*', 'https://*/*'])
	})

	it('loads the service worker as an ES module', () => {
		expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' })
	})

	it('has a side panel and an options page', () => {
		expect(manifest.side_panel.default_path).toBe('side-panel.html')
		expect(manifest.options_ui.page).toBe('options.html')
		expect(manifest.options_ui.open_in_tab).toBe(true)
	})

	it('does not weaken the CSP with eval or remote code', () => {
		const csp = manifest.content_security_policy.extension_pages
		expect(csp).toContain("script-src 'self'")
		expect(csp).not.toContain('unsafe-eval')
		expect(csp).not.toContain('wasm-unsafe-eval')
		expect(csp).not.toContain('http')
	})

	it('opens the panel from the toolbar, so it must not use a popup', () => {
		expect(manifest.action.default_popup).toBeUndefined()
		expect(manifest.action.default_title).toBeTruthy()
	})

	it('ships every declared icon', () => {
		for (const path of Object.values(manifest.icons)) {
			expect(path).toMatch(/^images\/icon-\d+\.png$/)
		}
	})
})
