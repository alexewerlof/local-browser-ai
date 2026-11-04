import { debounce } from '../core/util'
import { defaultSettings, FONT_SIZE_SCALES, normalizeSettings } from '../core/settings'
import { Store } from '../core/store'
import type { AppSettings } from '../core/types'
import { syncOriginStripping } from '../platform/net-rules'
import { createStore, STORAGE_KEYS } from '../platform/storage'

const storage = createStore()

export const settingsStore = new Store<AppSettings>(defaultSettings())
export const settingsStatusStore = new Store<'loading' | 'ready'>('loading')

const persist = debounce((settings: AppSettings) => {
	void storage.set(STORAGE_KEYS.settings, settings)
}, 250)

/**
 * Appearance is a document-level concern, so it is applied to `<html>` whenever settings land
 * rather than from a component effect: the panel and the options page both read the same
 * `data-theme` attribute and `--text-scale` token.
 */
function applyAppearance(settings: AppSettings): void {
	if (typeof document === 'undefined') return
	const root = document.documentElement
	if (settings.ui.theme === 'system') root.removeAttribute('data-theme')
	else root.setAttribute('data-theme', settings.ui.theme)
	root.style.setProperty('--text-scale', String(FONT_SIZE_SCALES[settings.ui.fontSize]))
}

/**
 * MCP servers may ask for requests without an `Origin` header. The rules live in the
 * browser, not in settings, so they must be rebuilt whenever settings land.
 */
function applyNetworkRules(settings: AppSettings): void {
	void syncOriginStripping(settings.tools.mcp)
}

export async function loadSettings(): Promise<AppSettings> {
	const stored = await storage.get<unknown>(STORAGE_KEYS.settings, null)
	const settings = normalizeSettings(stored)
	settingsStore.set(settings)
	applyAppearance(settings)
	applyNetworkRules(settings)
	settingsStatusStore.set('ready')
	return settings
}

let initialized = false

/** Load once and keep the store in sync with changes made from the options page. */
export async function initSettings(): Promise<void> {
	if (initialized) return
	initialized = true
	await loadSettings()
	storage.watch(STORAGE_KEYS.settings, (value) => {
		const settings = normalizeSettings(value)
		settingsStore.set(settings)
		applyAppearance(settings)
		applyNetworkRules(settings)
	})
}

export function updateSettings(update: (settings: AppSettings) => AppSettings): void {
	const next = update(settingsStore.get())
	settingsStore.set(next)
	applyAppearance(next)
	applyNetworkRules(next)
	persist(next)
}

export async function flushSettings(): Promise<void> {
	persist.flush()
}
