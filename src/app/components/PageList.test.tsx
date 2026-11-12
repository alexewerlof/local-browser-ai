// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { PageSnapshot } from '../../core/types'
import { PageList } from './PageList'

afterEach(cleanup)

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

type PageListProps = Parameters<typeof PageList>[0]

/** Render the header section with the wiring a chat gives it; a test overrides what it watches. */
function renderList(pages: PageSnapshot[], overrides: Partial<PageListProps> = {}) {
	const props: PageListProps = {
		pages,
		busy: false,
		open: true,
		addDisabled: false,
		addTitle: 'Add “Example Pricing” to this chat',
		onToggle: vi.fn(),
		onAdd: vi.fn(),
		onOpen: vi.fn(),
		onRemove: vi.fn(),
		...overrides,
	}
	return { ...render(<PageList {...props} />), props }
}

const desk = page({ id: 'page-2', handle: 'p2', title: 'Standing desk', url: 'https://garden.example/desk' })

describe('PageList header', () => {
	it('names the count and keeps the add when the chat has no pages', () => {
		const { container, props } = renderList([])

		expect(container.querySelector('.page-list__caption')?.textContent).toBe('0 pages')
		// Nothing to open, so there is no chevron and no list: only the way to add one.
		expect(container.querySelector('.page-list__toggle')).toBeNull()
		expect(container.querySelector('.page-list__panel')).toBeNull()

		const add = container.querySelector<HTMLButtonElement>('.page-list__add')
		expect(add?.textContent).toBe('Add page')
		expect(add?.title).toBe(props.addTitle)
		expect(add?.getAttribute('aria-label')).toBe('Add page to chat')
		if (add) fireEvent.click(add)
		expect(props.onAdd).toHaveBeenCalledTimes(1)
	})

	it('counts a single page in the header, not as a bare number', () => {
		const { container } = renderList([page()], { open: false })
		const toggle = container.querySelector<HTMLButtonElement>('.page-list__toggle')
		expect(toggle?.querySelector('.page-list__count')?.textContent).toBe('1')
		expect(toggle?.querySelector('.page-list__label')?.textContent).toBe('page')
		expect(toggle?.getAttribute('aria-label')).toBe('1 page in this chat')
	})

	it('points the chevron at the list only while it is open', () => {
		const closed = renderList([page(), desk], { open: false })
		const closedToggle = closed.container.querySelector<HTMLButtonElement>('.page-list__toggle')
		expect(closedToggle?.querySelector('.lucide-chevron-right')).not.toBeNull()
		expect(closedToggle?.querySelector('.lucide-chevron-down')).toBeNull()
		expect(closedToggle?.getAttribute('aria-expanded')).toBe('false')
		expect(closedToggle?.getAttribute('aria-controls')).toBeNull()
		expect(closedToggle?.title).toBe('Show pages')
		cleanup()

		const open = renderList([page(), desk], { open: true })
		const openToggle = open.container.querySelector<HTMLButtonElement>('.page-list__toggle')
		expect(openToggle?.querySelector('.lucide-chevron-down')).not.toBeNull()
		expect(openToggle?.querySelector('.lucide-chevron-right')).toBeNull()
		expect(openToggle?.getAttribute('aria-expanded')).toBe('true')
		expect(openToggle?.getAttribute('aria-controls')).toBe('page-list-pages')
		expect(openToggle?.title).toBe('Hide pages')
	})

	it('opens and closes on its own click', () => {
		const onToggle = vi.fn()
		const { container } = renderList([page(), desk], { onToggle })
		const toggle = container.querySelector<HTMLButtonElement>('.page-list__toggle')
		if (toggle) fireEvent.click(toggle)
		expect(onToggle).toHaveBeenCalledTimes(1)
	})

	it('disables the add only when there is nothing it could capture', () => {
		const ready = renderList([page(), desk])
		expect(ready.container.querySelector<HTMLButtonElement>('.page-list__add')?.disabled).toBe(false)
		cleanup()

		// No readable tab, or a capture already running: the button says so instead of
		// promising an add it cannot make.
		const blocked = renderList([], { addDisabled: true })
		expect(blocked.container.querySelector<HTMLButtonElement>('.page-list__add')?.disabled).toBe(true)
	})

	it('pulses the caption only while a page is being captured', () => {
		const sent = page({ messageId: 'msg-1' })

		const capturing = renderList([sent, page({ id: 'page-2', handle: 'p2' })], { busy: true })
		// The count is the only thing in the header to watch, so the caption is what pulses.
		const pulse = capturing.container.querySelector('.page-list__toggle .page-list__capturing')
		expect(pulse?.textContent).toBe('2 pages')

		cleanup()

		// Both pages are waiting for a turn, but nothing is being converted.
		const idle = renderList([sent, page({ id: 'page-3', handle: 'p2' })])
		expect(idle.container.querySelector('.page-list__capturing')).toBeNull()
		// The count still tells the whole story for a screen reader.
		expect(idle.container.querySelector('.page-list__toggle')?.getAttribute('aria-label')).toBe(
			'2 pages in this chat, 1 waiting for a turn',
		)
	})

	it('shows the busy wording before the first page arrives', () => {
		const { container } = renderList([], { busy: true })
		expect(container.querySelector('.page-list__caption--empty')?.textContent).toBe('Adding the page…')
	})
})

describe('PageList', () => {
	it('trails each row with when the page was captured', () => {
		const now = Date.now()
		const today = page({ id: 'page-a', handle: 'p1', capturedAt: now })
		const earlier = page({ id: 'page-b', handle: 'p2', capturedAt: now - 3 * 24 * 60 * 60 * 1000 })
		const { container } = renderList([today, earlier])

		const rows = container.querySelectorAll<HTMLButtonElement>('.page-chip--list')
		const stamps = Array.from(container.querySelectorAll('.page-chip__stamp')).map((node) => node.textContent)
		expect(stamps).toHaveLength(2)
		// Today is the clock time alone; another day carries its date too.
		expect(stamps[0]).not.toContain(',')
		expect(stamps[1]).toContain(',')
		expect(stamps[0]).not.toBe(stamps[1])
		// Never relative: an open list must not keep claiming "2 minutes ago".
		for (const stamp of stamps) expect(stamp).not.toMatch(/ago|now/i)
		// A screen reader is told the same thing the stamp shows.
		expect(rows[0]?.getAttribute('aria-label')).toContain(`, added ${stamps[0]}`)
	})

	it('puts the stamp after the icon and title, and spells the instant out in the tooltip', () => {
		const capturedAt = Date.now() - 2 * 60 * 60 * 1000
		const { container } = renderList([
			page({ messageId: 'msg-1', capturedAt, faviconUrl: 'https://example.com/favicon.ico' }),
		])

		const row = container.querySelector<HTMLButtonElement>('.page-chip--list')
		const order = Array.from(row?.children ?? []).map((node) => node.className || node.tagName.toLowerCase())
		expect(order).toEqual(['page-chip__icon', 'page-chip__title', 'page-chip__stamp', 'page-chip__host'])

		const stamp = container.querySelector<HTMLTimeElement>('time.page-chip__stamp')
		// `<time>` carries the machine-readable instant; the native tooltip is the same
		// moment written out in the user's own locale.
		expect(stamp?.dateTime).toBe(new Date(capturedAt).toISOString())
		expect(stamp?.title).toBe(
			new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long' }).format(new Date(capturedAt)),
		)
		// The row shows the time to the second; the tooltip is the only place with a year.
		expect(stamp?.textContent?.split(':')).toHaveLength(3)
	})

	it('lists every page as a row with its host', () => {
		const { container } = renderList([page({ messageId: 'msg-1' }), desk])

		expect(container.querySelectorAll('.page-list__panel > li')).toHaveLength(2)
		expect(container.querySelectorAll('.page-chip--list')).toHaveLength(2)
		expect(Array.from(container.querySelectorAll('.page-chip__title')).map((node) => node.textContent)).toEqual([
			'Example Pricing',
			'Standing desk',
		])
		expect(Array.from(container.querySelectorAll('.page-chip__host')).map((node) => node.textContent)).toEqual([
			'example.com',
			'garden.example',
		])
		expect(container.querySelector('.page-list__panel')?.id).toBe('page-list-pages')
	})

	it('holds no rows while the list is closed', () => {
		const { container } = renderList([page({ messageId: 'msg-1' }), desk], { open: false })
		expect(container.querySelectorAll('.page-chip')).toHaveLength(0)
		expect(container.querySelector('.page-list__panel')).toBeNull()
	})

	it('brings the page of a row back', () => {
		const onOpen = vi.fn()
		const { container } = renderList([page({ messageId: 'msg-1' }), desk], { onOpen })
		const row = container.querySelectorAll<HTMLButtonElement>('.page-chip')[1]
		if (row) fireEvent.click(row)
		expect(onOpen).toHaveBeenCalledWith(desk)
	})

	it('offers a trash can only while a page has not reached a turn', () => {
		const sent = page({ messageId: 'msg-1' })
		const { container } = renderList([sent, desk])

		expect(container.querySelectorAll('.page-list__item--pending')).toHaveLength(1)
		expect(container.querySelectorAll('.page-list__remove')).toHaveLength(1)
		const row = container.querySelectorAll<HTMLLIElement>('.page-list__item')[1]
		expect(row?.classList.contains('page-list__item--pending')).toBe(true)
	})

	it('removes the page the trash can belongs to', () => {
		const onRemove = vi.fn()
		const { container } = renderList([desk], { onRemove })
		const remove = container.querySelector<HTMLButtonElement>('.page-list__remove')
		expect(remove?.getAttribute('aria-label')).toBe('Remove Standing desk from this chat')
		if (remove) fireEvent.click(remove)
		expect(onRemove).toHaveBeenCalledWith(desk)
	})
})
