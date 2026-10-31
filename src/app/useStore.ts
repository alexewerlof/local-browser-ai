import { useSyncExternalStore } from 'react'
import type { Store } from '../core/store'

/** Subscribe a component to one of the app's plain observable stores. */
export function useStore<T>(store: Store<T>): T {
	return useSyncExternalStore(store.subscribe, store.get, store.get)
}
