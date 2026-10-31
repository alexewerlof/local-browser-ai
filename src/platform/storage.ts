import { getChrome } from './chrome'

/** Key/value persistence: `chrome.storage.local` in the extension, localStorage in the harness. */
export interface KeyValueStore {
	get<T>(key: string, fallback: T): Promise<T>
	set(key: string, value: unknown): Promise<void>
	remove(key: string): Promise<void>
	/** Subscribe to changes of a single key. Returns an unsubscribe function. */
	watch(key: string, listener: (value: unknown) => void): () => void
}

class ChromeStore implements KeyValueStore {
	async get<T>(key: string, fallback: T): Promise<T> {
		const chromeApi = getChrome()
		if (!chromeApi?.storage?.local) return fallback
		const result = await chromeApi.storage.local.get(key)
		return key in result ? (result[key] as T) : fallback
	}

	async set(key: string, value: unknown): Promise<void> {
		const chromeApi = getChrome()
		if (!chromeApi?.storage?.local) return
		await chromeApi.storage.local.set({ [key]: value })
	}

	async remove(key: string): Promise<void> {
		const chromeApi = getChrome()
		if (!chromeApi?.storage?.local) return
		await chromeApi.storage.local.remove(key)
	}

	watch(key: string, listener: (value: unknown) => void): () => void {
		const chromeApi = getChrome()
		if (!chromeApi?.storage?.onChanged) return () => {}
		const handler = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
			if (areaName !== 'local') return
			const change = changes[key]
			if (change) listener(change.newValue)
		}
		chromeApi.storage.onChanged.addListener(handler)
		return () => chromeApi.storage.onChanged.removeListener(handler)
	}
}

class WebStore implements KeyValueStore {
	#prefix = 'local-browser-ai:'

	async get<T>(key: string, fallback: T): Promise<T> {
		try {
			const raw = localStorage.getItem(this.#prefix + key)
			return raw === null ? fallback : (JSON.parse(raw) as T)
		} catch {
			return fallback
		}
	}

	async set(key: string, value: unknown): Promise<void> {
		try {
			localStorage.setItem(this.#prefix + key, JSON.stringify(value))
		} catch {
			// Quota or private mode; the in-memory store keeps working.
		}
	}

	async remove(key: string): Promise<void> {
		try {
			localStorage.removeItem(this.#prefix + key)
		} catch {
			// ignore
		}
	}

	watch(key: string, listener: (value: unknown) => void): () => void {
		const handler = (event: StorageEvent) => {
			if (event.key !== this.#prefix + key) return
			try {
				listener(event.newValue === null ? undefined : JSON.parse(event.newValue))
			} catch {
				listener(undefined)
			}
		}
		window.addEventListener('storage', handler)
		return () => window.removeEventListener('storage', handler)
	}
}

export function createStore(): KeyValueStore {
	return getChrome()?.storage?.local ? new ChromeStore() : new WebStore()
}

export const STORAGE_KEYS = {
	settings: 'settings.v1',
	onboarding: 'onboarding.v1',
	uiState: 'ui-state.v1',
} as const
