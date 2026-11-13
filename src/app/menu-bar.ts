import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { Store } from '../core/store'

/**
 * Which menu of the composer's bar is open, by the owning item's block name
 * (`pages-menu__trigger`, `tools-menu__trigger`, …), or `null`.
 *
 * One store rather than a `useState` per menu, because the bar behaves like a window's menu
 * bar and not like a row of buttons: two menus can never be open beside each other, and once
 * one is open, moving the pointer along the bar is how the user reaches the next. A menu that
 * owned its own flag would let two panels share the screen, and the item under the pointer
 * would have no way to know whether it should open or close.
 */
export const openMenuStore = new Store<string | null>(null)

/** Open `id`'s menu — the click on an item, or a menu that opens itself on an event. */
export function openMenu(id: string): void {
	openMenuStore.set(id)
}

/**
 * The bar's click: open this menu, or close it when it is the one already open. Clicking the
 * item under the pointer therefore closes the menu a hover had opened, which is what a window
 * menu bar does.
 */
export function toggleMenu(id: string): void {
	openMenuStore.set((current) => (current === id ? null : id))
}

/**
 * The bar's hover: once a menu is open, moving onto another item opens that one instead. With
 * nothing open the bar stays inert, because sweeping the pointer across the bar on the way
 * somewhere else must not leave a panel behind.
 */
export function hoverMenu(id: string): void {
	openMenuStore.set((current) => (current === null ? null : id))
}

/**
 * Close `id`'s menu, and only it: a menu reporting an outside click, or a page that unmounts,
 * must not take down a menu opened after it.
 */
export function closeMenu(id: string): void {
	openMenuStore.set((current) => (current === id ? null : current))
}

/** The four things every bar item does, with the store kept out of the components. */
export interface BarMenu {
	open: boolean
	show: () => void
	toggle: () => void
	hover: () => void
	close: () => void
}

/** `id`'s place on the bar: whether its menu is the open one, and how to change that. */
export function useBarMenu(id: string): BarMenu {
	const open = useSyncExternalStore(openMenuStore.subscribe, openMenuStore.get, openMenuStore.get)
	const show = useCallback(() => openMenu(id), [id])
	const toggle = useCallback(() => toggleMenu(id), [id])
	const hover = useCallback(() => hoverMenu(id), [id])
	const close = useCallback(() => closeMenu(id), [id])

	// A menu that leaves the screen must not leave the bar thinking it is still open: switching
	// to a model that does not reason unmounts the Thinking menu, and Settings can remove the
	// last template. The store is module state, so it outlives the component.
	useEffect(() => () => closeMenu(id), [id])

	return { open: open === id, show, toggle, hover, close }
}
