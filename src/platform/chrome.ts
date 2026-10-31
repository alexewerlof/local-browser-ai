/**
 * Thin platform layer so the app runs both inside the extension and inside the
 * browser-based e2e harness (a plain web page with a `chrome` shim).
 */

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

/** Open the settings page as a normal tab. */
export async function openOptionsPage(): Promise<void> {
	const chromeApi = getChrome()
	if (chromeApi?.runtime?.openOptionsPage) {
		await chromeApi.runtime.openOptionsPage()
		return
	}
	window.open(extensionUrl('options.html'), '_blank', 'noopener,noreferrer')
}
