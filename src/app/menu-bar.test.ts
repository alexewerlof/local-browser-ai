import { afterEach, describe, expect, it } from 'vitest'
import { closeMenu, hoverMenu, openMenu, openMenuStore, toggleMenu } from './menu-bar'

afterEach(() => openMenuStore.set(null))

/**
 * The bar's rules, without a browser: one menu at a time, a click toggles, and a hover hands
 * an open menu to the item under the pointer — but only when one is already open.
 */
describe('menu bar', () => {
	it('starts with nothing open', () => {
		expect(openMenuStore.get()).toBe(null)
	})

	it('opens one menu at a time', () => {
		openMenu('pages-menu__trigger')
		expect(openMenuStore.get()).toBe('pages-menu__trigger')
		openMenu('tools-menu__trigger')
		expect(openMenuStore.get()).toBe('tools-menu__trigger')
	})

	it('toggles the menu it is called for, and only that one', () => {
		toggleMenu('tools-menu__trigger')
		expect(openMenuStore.get()).toBe('tools-menu__trigger')

		toggleMenu('tools-menu__trigger')
		expect(openMenuStore.get()).toBe(null)

		// The click on another item opens that item's menu.
		toggleMenu('tools-menu__trigger')
		toggleMenu('model-menu__trigger')
		expect(openMenuStore.get()).toBe('model-menu__trigger')
	})

	it('leaves the bar inert on hover while no menu is open', () => {
		hoverMenu('tools-menu__trigger')
		expect(openMenuStore.get()).toBe(null)
	})

	it('hands an open menu over to the item under the pointer', () => {
		openMenu('pages-menu__trigger')
		hoverMenu('tools-menu__trigger')
		expect(openMenuStore.get()).toBe('tools-menu__trigger')
		// Hovering the item that owns the open menu changes nothing.
		hoverMenu('tools-menu__trigger')
		expect(openMenuStore.get()).toBe('tools-menu__trigger')
	})

	it('closes only its own menu', () => {
		openMenu('model-menu__trigger')
		closeMenu('tools-menu__trigger')
		expect(openMenuStore.get()).toBe('model-menu__trigger')

		closeMenu('model-menu__trigger')
		expect(openMenuStore.get()).toBe(null)
	})

	it('notifies its subscribers once per change', () => {
		let calls = 0
		const unsubscribe = openMenuStore.subscribe(() => {
			calls += 1
		})
		openMenu('tools-menu__trigger')
		openMenu('tools-menu__trigger')
		hoverMenu('tools-menu__trigger')
		closeMenu('tools-menu__trigger')
		unsubscribe()
		expect(calls).toBe(2)
	})
})
