// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { PageSnapshot } from '../../core/types'
import { lastPageAddedStore } from '../../state/pages'
import { openMenuStore } from '../menu-bar'
import { PagesMenu } from './PagesMenu'

afterEach(() => {
	cleanup()
	lastPageAddedStore.set(null)
	openMenuStore.set(null)
})

function page(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
	return {
		id: 'page-1',
		conversationId: 'chat-1',
		handle: 'p1',
		url: 'https://example.com/pricing',
		title: 'Example Pricing',
		markdown: '',
		outline: [],
		chunks: [],
		capturedAt: 0,
		truncated: false,
		totalChars: 1200,
		block: '',
		...overrides,
	}
}

type PagesMenuProps = Parameters<typeof PagesMenu>[0]

/** Render the menu with the wiring a chat gives it; a test overrides what it watches. */
function renderMenu(pages: PageSnapshot[], overrides: Partial<PagesMenuProps> = {}) {
	const props: PagesMenuProps = {
		pages,
		conversationId: 'chat-1',
		busy: false,
		addDisabled: false,
		addTitle: 'Add “Example Pricing” to this chat',
		onAdd: vi.fn(),
		onOpen: vi.fn(),
		onRemove: vi.fn(),
		...overrides,
	}
	return { ...render(<PagesMenu {...props} />), props }
}

/** The trigger, and the only thing a closed menu shows. */
function trigger(container: HTMLElement): HTMLButtonElement {
	const button = container.querySelector<HTMLButtonElement>('.pages-menu__trigger')
	if (!button) throw new Error('the pages trigger must always be rendered')
	return button
}

function openMenu(container: HTMLElement): HTMLButtonElement {
	fireEvent.click(trigger(container))
	return trigger(container)
}

const desk = page({ id: 'page-2', handle: 'p2', title: 'Standing desk', url: 'https://garden.example/desk' })

describe('PagesMenu trigger', () => {
	it('always shows the count, even with no pages, and starts closed', () => {
		const { container } = renderMenu([])

		const button = trigger(container)
		expect(button.querySelector('.menu-item__label')?.textContent).toBe('Pages')
		expect(button.querySelector('.menu-item__count')?.textContent).toBe('0')
		expect(button.getAttribute('aria-expanded')).toBe('false')
		// Closed is the state the bar is in almost all the time, so nothing else renders.
		expect(container.querySelector('.popover')).toBeNull()
		expect(container.querySelector('.pages-menu__list')).toBeNull()
	})

	it('opens the menu on the trigger and closes it again', () => {
		const { container } = renderMenu([page()])

		expect(openMenu(container).getAttribute('aria-expanded')).toBe('true')
		expect(container.querySelector('.pages-menu__list > li')).not.toBeNull()

		fireEvent.click(trigger(container))
		expect(trigger(container).getAttribute('aria-expanded')).toBe('false')
		expect(container.querySelector('.popover')).toBeNull()
	})

	it('pulses the count only while a page is being captured', () => {
		const idle = renderMenu([page()])
		expect(idle.container.querySelector('.menu-item__count--busy')).toBeNull()
		cleanup()

		const busy = renderMenu([page()], { busy: true })
		expect(busy.container.querySelector('.menu-item__count--busy')).not.toBeNull()
	})

	it('takes the bar over on a click, and gives it back on the next one', () => {
		const { container } = renderMenu([page()])
		fireEvent.click(trigger(container))
		expect(openMenuStore.get()).toBe('pages-menu__trigger')

		fireEvent.click(trigger(container))
		expect(openMenuStore.get()).toBe(null)
	})

	it('opens itself when the pointer arrives on it with another menu already open', () => {
		const { container } = renderMenu([page()])
		expect(trigger(container).getAttribute('aria-expanded')).toBe('false')

		// Nothing is open, so sweeping the pointer across the bar must leave it alone.
		fireEvent.pointerOver(trigger(container), { pointerType: 'mouse' })
		expect(openMenuStore.get()).toBe(null)

		// With a menu open the bar hands it to the item under the pointer.
		act(() => openMenuStore.set('tools-menu__trigger'))
		fireEvent.pointerOver(trigger(container), { pointerType: 'mouse' })
		expect(openMenuStore.get()).toBe('pages-menu__trigger')
		expect(trigger(container).getAttribute('aria-expanded')).toBe('true')
	})

	it('leaves the bar alone for a finger or a pen, which do not hover', () => {
		const { container } = renderMenu([page()])
		act(() => openMenuStore.set('tools-menu__trigger'))

		fireEvent.pointerOver(trigger(container), { pointerType: 'touch' })
		expect(openMenuStore.get()).toBe('tools-menu__trigger')
		fireEvent.pointerOver(trigger(container), { pointerType: 'pen' })
		expect(openMenuStore.get()).toBe('tools-menu__trigger')
	})

	it('lets go of the bar when it leaves the screen', () => {
		const { container, unmount } = renderMenu([page()])
		fireEvent.click(trigger(container))
		expect(openMenuStore.get()).toBe('pages-menu__trigger')

		unmount()
		expect(openMenuStore.get()).toBe(null)
	})
})

describe('PagesMenu body', () => {
	it('says the chat has no pages, and still offers the add', () => {
		const { container, props } = renderMenu([])
		openMenu(container)

		expect(container.querySelector('.popover__empty')?.textContent).toBe('No pages in this chat.')
		const add = container.querySelector<HTMLButtonElement>('.pages-menu__add')
		expect(add?.disabled).toBe(false)
		expect(add?.title).toBe(props.addTitle)
		expect(add?.getAttribute('aria-label')).toBe('Add page to chat')
	})

	it('names the work in progress instead of an empty list', () => {
		const { container } = renderMenu([], { busy: true })
		openMenu(container)
		expect(container.querySelector('.popover__empty')?.textContent).toBe('Adding the page…')
	})

	it('adds, then closes so the grant box has the screen', () => {
		const { container, props } = renderMenu([])
		openMenu(container)

		fireEvent.click(container.querySelector('.pages-menu__add') as HTMLElement)
		expect(props.onAdd).toHaveBeenCalledTimes(1)
		expect(trigger(container).getAttribute('aria-expanded')).toBe('false')
	})

	it('disables the add, and says what it would capture, while the tab cannot be read', () => {
		const { container } = renderMenu([], {
			addDisabled: true,
			addTitle: 'Add the page you are reading to this chat',
		})
		openMenu(container)

		const add = container.querySelector<HTMLButtonElement>('.pages-menu__add')
		expect(add?.disabled).toBe(true)
		expect(add?.title).toBe('Add the page you are reading to this chat')
	})

	it('lists one row per page, each opening its page', () => {
		const { container, props } = renderMenu([page(), desk])
		openMenu(container)

		const rows = [...container.querySelectorAll('.pages-menu__list > li')]
		expect(rows).toHaveLength(2)
		expect([...container.querySelectorAll('.page-chip__title')].map((node) => node.textContent)).toEqual([
			'Example Pricing',
			'Standing desk',
		])
		// The host closes the row, after the title and its stamp.
		expect([...container.querySelectorAll('.page-chip__host')].map((node) => node.textContent)).toEqual([
			'example.com',
			'garden.example',
		])

		fireEvent.click(container.querySelectorAll('.page-chip')[1] as HTMLElement)
		expect(props.onOpen).toHaveBeenCalledWith(desk)
		expect(trigger(container).getAttribute('aria-expanded')).toBe('false')
	})

	it('stamps each capture absolutely, in a machine-readable element', () => {
		const capturedAt = Date.UTC(2026, 10, 12, 9, 21, 23)
		const { container } = renderMenu([page({ capturedAt })])
		openMenu(container)

		const time = container.querySelector<HTMLTimeElement>('time.page-chip__stamp')
		expect(time?.getAttribute('datetime')).toBe(new Date(capturedAt).toISOString())
		expect(time?.textContent).toMatch(/\d{1,2}[:.]\d{2}[:.]\d{2}/)
		expect(time?.textContent).not.toMatch(/ago|now/i)
		expect((time?.title ?? '').length).toBeGreaterThan((time?.getAttribute('datetime') ?? '').length)
	})

	it('dims a page no turn carries yet, and offers the way back out', () => {
		const { container, props } = renderMenu([page(), page({ ...desk, messageId: 'm1' })])
		openMenu(container)

		expect(container.querySelectorAll('.pages-menu__item--pending')).toHaveLength(1)
		expect(container.querySelectorAll('.pages-menu__remove')).toHaveLength(1)
		const remove = container.querySelector<HTMLButtonElement>('.pages-menu__remove')
		if (!remove) throw new Error('a pending page must offer the way out')

		fireEvent.click(remove)
		expect(props.onRemove).toHaveBeenCalledWith(page())
		// Removing is a row action, not a reason to close the menu.
		expect(trigger(container).getAttribute('aria-expanded')).toBe('true')
	})
})

describe('PagesMenu search', () => {
	it('matches the title the row shows and the host behind it', () => {
		const { container } = renderMenu([page(), desk])
		openMenu(container)
		const search = container.querySelector<HTMLInputElement>('.popover__header .input')
		if (!search) throw new Error('the menu must offer a search')

		fireEvent.change(search, { target: { value: 'desk' } })
		expect(container.querySelectorAll('.pages-menu__list > li')).toHaveLength(1)
		expect(container.querySelector('.page-chip__title')?.textContent).toBe('Standing desk')

		fireEvent.change(search, { target: { value: 'garden.example' } })
		expect(container.querySelectorAll('.pages-menu__list > li')).toHaveLength(1)

		fireEvent.change(search, { target: { value: 'example.com/pricing' } })
		expect(container.querySelector('.page-chip__title')?.textContent).toBe('Example Pricing')
	})

	it('says so when nothing matches, and does not claim the chat is empty', () => {
		const { container } = renderMenu([page()])
		openMenu(container)

		fireEvent.change(container.querySelector('.popover__header .input') as HTMLElement, {
			target: { value: 'nothing' },
		})
		expect(container.querySelector('.popover__empty')?.textContent).toBe('No pages match.')
		expect(container.querySelector('.pages-menu__list')).toBeNull()
	})
})

describe('PagesMenu opening itself', () => {
	it('opens on a page that just arrived, with the search cleared', () => {
		const { container, rerender, props } = renderMenu([page()])
		openMenu(container)
		fireEvent.change(container.querySelector('.popover__header .input') as HTMLElement, {
			target: { value: 'desk' },
		})
		fireEvent.click(trigger(container))
		expect(trigger(container).getAttribute('aria-expanded')).toBe('false')

		// A capture lands while the menu is closed: the count alone would be too quiet.
		act(() => lastPageAddedStore.set('page-2'))
		rerender(<PagesMenu {...props} pages={[page(), desk]} />)

		expect(trigger(container).getAttribute('aria-expanded')).toBe('true')
		expect(container.querySelector<HTMLInputElement>('.popover__header .input')?.value).toBe('')
		expect(container.querySelectorAll('.pages-menu__list > li')).toHaveLength(2)
	})

	it('closes when the chat changes, because the rows belong to one chat', () => {
		const { container, rerender, props } = renderMenu([page()])
		openMenu(container)

		rerender(<PagesMenu {...props} conversationId="chat-2" pages={[]} />)
		expect(trigger(container).getAttribute('aria-expanded')).toBe('false')
	})
})
