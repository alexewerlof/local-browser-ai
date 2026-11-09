import { afterEach, describe, expect, it, vi } from 'vitest'
import { extensionSiteDetailsUrl, openExtensionSiteDetails, openPlatformSettings, platformSettingsUrl } from './chrome'

const EXTENSION_ID = 'pbapheoahbjhbmokcapedhmnblfgiik'
const EXTENSIONS_URL = `chrome://extensions/?id=${EXTENSION_ID}`
const SITE_DETAILS_URL = `chrome://settings/content/siteDetails?site=chrome-extension://${EXTENSION_ID}`

type ChromeStub = {
	runtime: { id: string; getURL: (path: string) => string }
	tabs: { create: (properties: { url: string }) => Promise<{ id: number }> }
}

function stubChrome(): ChromeStub {
	const stub: ChromeStub = {
		runtime: { id: EXTENSION_ID, getURL: (path) => `chrome-extension://${EXTENSION_ID}/${path}` },
		tabs: { create: () => Promise.resolve({ id: 1 }) },
	}
	;(globalThis as { chrome?: unknown }).chrome = stub
	return stub
}

afterEach(() => {
	delete (globalThis as { chrome?: unknown }).chrome
})

describe('platformSettingsUrl', () => {
	it('names this extension on the Extensions page', () => {
		stubChrome()
		expect(platformSettingsUrl()).toBe(EXTENSIONS_URL)
	})

	it('is null outside an extension, where there is no id to name', () => {
		expect(platformSettingsUrl()).toBeNull()
	})
})

describe('openPlatformSettings', () => {
	it('creates one tab on the Extensions page', async () => {
		const chromeApi = stubChrome()
		const create = vi.fn(() => Promise.resolve({ id: 7 }))
		chromeApi.tabs.create = create

		await openPlatformSettings()

		expect(create).toHaveBeenCalledTimes(1)
		expect(create).toHaveBeenCalledWith({ url: EXTENSIONS_URL })
	})

	it('resolves quietly outside an extension', async () => {
		await expect(openPlatformSettings()).resolves.toBeUndefined()
	})
})

describe('extensionSiteDetailsUrl', () => {
	it('names this extension on the site details page', () => {
		stubChrome()
		expect(extensionSiteDetailsUrl()).toBe(SITE_DETAILS_URL)
	})

	it('is null outside an extension, where there is no id to name', () => {
		expect(extensionSiteDetailsUrl()).toBeNull()
	})
})

describe('openExtensionSiteDetails', () => {
	it('creates one tab on the site details page', async () => {
		const chromeApi = stubChrome()
		const create = vi.fn(() => Promise.resolve({ id: 7 }))
		chromeApi.tabs.create = create

		await openExtensionSiteDetails()

		expect(create).toHaveBeenCalledTimes(1)
		expect(create).toHaveBeenCalledWith({ url: SITE_DETAILS_URL })
	})

	it('resolves quietly outside an extension', async () => {
		await expect(openExtensionSiteDetails()).resolves.toBeUndefined()
	})
})
