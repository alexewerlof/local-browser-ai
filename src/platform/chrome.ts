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
 * Chrome offers no "focus the Settings page" call, so the extension does it itself: `tabs.query`
 * gives it the tab URLs (that is what the `tabs` permission is for), the match is a prefix
 * because fragments are not part of a match pattern, and the section is applied with
 * `tabs.update`. Only one Settings tab is ever open.
 */
export async function openSettings(section?: SettingsSectionId): Promise<void> {
	const chromeApi = getChrome()
	const base = extensionUrl('settings.html')
	// General has no fragment at all, so its section hash is the empty string and `url` is the
	// bare page — the same URL `options_ui` opens.
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

/** Chrome's per-extension page, which owns the controls no extension can reproduce. */
const PLATFORM_SETTINGS_BASE = 'chrome://extensions/?id='

/** Chrome's per-extension site settings: permissions, notifications and pop-ups for this origin. */
const SITE_DETAILS_BASE = 'chrome://settings/content/siteDetails?site=chrome-extension://'

/**
 * Both links are a `chrome://` URL naming this extension, so they can only be opened with
 * `tabs.create`: rendering one as an `<a href>` would be a renderer-initiated navigation to a
 * privileged scheme, which Chrome blocks. `null` outside an extension, where there is no
 * `runtime.id` to name.
 */
function extensionChromeUrl(base: string): string | null {
	const chromeApi = getChrome()
	return chromeApi ? `${base}${chromeApi.runtime.id}` : null
}

/**
 * The URL of this extension's entry in Chrome's Extensions page — shortcuts, allow-in-incognito
 * and the update controls all live there.
 */
export function platformSettingsUrl(): string | null {
	return extensionChromeUrl(PLATFORM_SETTINGS_BASE)
}

/**
 * The URL of this extension's own entry in Chrome's site settings — the page that grants or
 * blocks location, camera, notifications and pop-ups for the `chrome-extension://` origin.
 */
export function extensionSiteDetailsUrl(): string | null {
	return extensionChromeUrl(SITE_DETAILS_BASE)
}

/**
 * Open one of Chrome's own pages in a new tab.
 *
 * Always a new tab, never a reused one: `chrome://` is Chrome's page, so it takes no part in the
 * one-Settings-tab rule `openSettings` enforces, and navigating a tab Chrome already owns is not
 * this extension's call.
 */
async function openChromePage(url: string | null, failure: string): Promise<void> {
	const chromeApi = getChrome()
	if (!chromeApi?.tabs || url === null) return
	try {
		await chromeApi.tabs.create({ url })
	} catch (error) {
		console.warn(`[lbai] ${failure}`, error)
	}
}

/** Open Chrome's Extensions page at this extension's entry. */
export async function openPlatformSettings(): Promise<void> {
	await openChromePage(platformSettingsUrl(), 'could not open the Extensions page')
}

/** Open Chrome's site settings at this extension's entry. */
export async function openExtensionSiteDetails(): Promise<void> {
	await openChromePage(extensionSiteDetailsUrl(), 'could not open the site settings page')
}
