/** Minimal observable store used with `useSyncExternalStore`. */

export type Listener = () => void

export class Store<T> {
	#value: T
	#listeners = new Set<Listener>()

	constructor(initial: T) {
		this.#value = initial
	}

	get = (): T => this.#value

	set = (next: T | ((previous: T) => T)): void => {
		const value = typeof next === 'function' ? (next as (previous: T) => T)(this.#value) : next
		if (Object.is(value, this.#value)) return
		this.#value = value
		for (const listener of this.#listeners) listener()
	}

	subscribe = (listener: Listener): (() => void) => {
		this.#listeners.add(listener)
		return () => {
			this.#listeners.delete(listener)
		}
	}
}
