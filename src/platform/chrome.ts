/**
 * Thin platform layer so the app runs both inside the extension and inside the
 * browser-based e2e harness (a plain web page with a `chrome` shim).
 */

import { settingsSectionHash, type SettingsSectionId } from '../core/settings-routes'

type ChromeLike = typeof chrome

export interface ManifestInfo {
	name: string
	version: string
	manifest_version?: number
}

export function getChrome(): ChromeLike | null {
	const candidate = (globalThis as { chrome?: ChromeLike }).chrome
	if (!candidate?.runtime?.id) return null
	return candidate
}

export function getManifest(): ManifestInfo {
	const chromeApi = getChrome()
	if (chromeApi) return chromeApi.runtime.getManifest() as ManifestInfo
	const injected = (globalThis as { __LB_AI_MANIFEST__?: ManifestInfo }).__LB_AI_MANIFEST__
	return injected ?? { name: 'Local Browser AI', version: '3.0.0-dev', manifest_version: 3 }
}

export function extensionUrl(path: string): string {
	const chromeApi = getChrome()
	if (chromeApi) return chromeApi.runtime.getURL(path)
	return new URL(path, document.baseURI).toString()
}

/**
 * Open Settings at a section, reusing the tab that is already open.
 *
 * Chrome offers no "focus the options page" call, so the extension does it itself: `tabs.query`
 * gives it the tab URLs (that is what the `tabs` permission is for), the match is a prefix
 * because fragments are not part of a match pattern, and the section is applied with
 * `tabs.update`. Only one Settings tab is ever open.
 */
export async function openOptionsPage(section?: SettingsSectionId): Promise<void> {
	const chromeApi = getChrome()
	const base = extensionUrl('options.html')
	const sectionHash = section === undefined ? null : settingsSectionHash(section)
	const url = sectionHash === null ? base : `${base}${sectionHash}`
	if (!chromeApi?.tabs) {
		window.open(url, '_blank', 'noopener,noreferrer')
		return
	}
	try {
		const existing = (await chromeApi.tabs.query({})).find((tab) => tab.url?.startsWith(base))
		if (existing?.id !== undefined) {
			// A tab in a background window stays invisible until that window is focused.
			if (existing.windowId !== undefined) {
				await chromeApi.windows?.update(existing.windowId, { focused: true })
			}
			const currentHash = existing.url ? new URL(existing.url).hash : ''
			// Without a section the tab keeps the one it is showing; a different section navigates.
			const navigate = sectionHash !== null && currentHash !== sectionHash
			await chromeApi.tabs.update(existing.id, navigate ? { active: true, url } : { active: true })
			return
		}
	} catch (error) {
		// Reusing the tab is best effort: a stale tab id must not lose the request.
		console.warn('[lbai] could not focus the Settings tab, opening a new one', error)
	}
	await chromeApi.tabs.create({ url })
}
