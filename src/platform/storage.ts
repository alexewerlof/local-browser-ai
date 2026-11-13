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
	#areaName: 'local' | 'session'

	constructor(areaName: 'local' | 'session' = 'local') {
		this.#areaName = areaName
	}

	#area(): chrome.storage.StorageArea | undefined {
		return getChrome()?.storage?.[this.#areaName]
	}

	async get<T>(key: string, fallback: T): Promise<T> {
		const area = this.#area()
		if (!area) return fallback
		const result = await area.get(key)
		return key in result ? (result[key] as T) : fallback
	}

	async set(key: string, value: unknown): Promise<void> {
		const area = this.#area()
		if (!area) return
		await area.set({ [key]: value })
	}

	async remove(key: string): Promise<void> {
		const area = this.#area()
		if (!area) return
		await area.remove(key)
	}

	watch(key: string, listener: (value: unknown) => void): () => void {
		const chromeApi = getChrome()
		if (!chromeApi?.storage?.onChanged) return () => {}
		const areaName = this.#areaName
		const handler = (changes: Record<string, chrome.storage.StorageChange>, changedArea: string) => {
			if (changedArea !== areaName) return
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

/**
 * Session storage: gone when the browser closes, which is exactly how long a browser-owned
 * id (a tab group id, say) means anything. A browser without the area falls back to the
 * web store, where the value simply outlives its usefulness and is re-checked on use.
 */
export function createSessionStore(): KeyValueStore {
	return getChrome()?.storage?.session ? new ChromeStore('session') : new WebStore()
}

export const STORAGE_KEYS = {
	settings: 'settings.v1',
	onboarding: 'onboarding.v1',
	uiState: 'ui-state.v1',
	/**
	 * Memory lives beside settings, not inside them: settings are rewritten on a 250 ms
	 * debounce on every keystroke, and memory must stay out of that document so it can
	 * be synced and exported on its own.
	 */
	memory: 'memory.v1',
} as const
