// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { PageSnapshot } from '../../core/types'
import { PageList, PageListToggle } from './PageList'

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

function renderToggle(pages: PageSnapshot[], { busy = false, open = false } = {}) {
	const onToggle = vi.fn()
	const view = render(<PageListToggle pages={pages} busy={busy} open={open} onToggle={onToggle} />)
	return { ...view, onToggle }
}

const desk = page({ id: 'page-2', handle: 'p2', title: 'Standing desk', url: 'https://garden.example/desk' })

describe('PageListToggle', () => {
	it('says how to add a page when the chat has none', () => {
		const { container } = renderToggle([])
		expect(container.querySelector('.page-list--empty')?.textContent).toMatch(/Add to chat/)
		expect(container.querySelector('.page-chip')).toBeNull()
	})

	it('counts a single page too, so every chat looks the same', () => {
		const { container } = renderToggle([page()])
		expect(container.querySelectorAll('.page-chip')).toHaveLength(0)
		const toggle = container.querySelector<HTMLButtonElement>('.page-list__toggle')
		expect(toggle?.textContent).toBe('1')
		expect(toggle?.querySelector('svg')).not.toBeNull()
		expect(toggle?.getAttribute('aria-label')).toBe('1 page in this chat')
	})

	it('counts several pages behind a page icon', () => {
		const { container, onToggle } = renderToggle([page(), desk])

		expect(container.querySelectorAll('.page-chip')).toHaveLength(0)
		const toggle = container.querySelector<HTMLButtonElement>('.page-list__toggle')
		expect(toggle?.textContent).toBe('2')
		expect(toggle?.querySelector('svg')).not.toBeNull()
		expect(toggle?.getAttribute('aria-expanded')).toBe('false')
		expect(toggle?.getAttribute('aria-controls')).toBeNull()
		expect(toggle?.title).toBe('Show pages')
		// Waiting for a turn is not work in progress, so the icon sits still.
		expect(container.querySelector('.page-list__capturing')).toBeNull()

		if (toggle) fireEvent.click(toggle)
		expect(onToggle).toHaveBeenCalledTimes(1)
	})

	it('reports an open list instead of toggling itself', () => {
		const { container } = renderToggle([page(), desk], { open: true })
		const toggle = container.querySelector<HTMLButtonElement>('.page-list__toggle')
		expect(toggle?.getAttribute('aria-expanded')).toBe('true')
		expect(toggle?.getAttribute('aria-controls')).toBe('page-list-pages')
		expect(toggle?.title).toBe('Hide pages')
	})

	it('pulses only while a page is being captured', () => {
		const sent = page({ messageId: 'msg-1' })

		const capturing = renderToggle([sent, page({ id: 'page-2', handle: 'p2' })], { busy: true })
		expect(capturing.container.querySelector('.page-list__capturing')).not.toBeNull()

		cleanup()

		// Both pages are waiting for a turn, but nothing is being converted.
		const idle = renderToggle([sent, page({ id: 'page-3', handle: 'p2' })])
		expect(idle.container.querySelector('.page-list__capturing')).toBeNull()
		// The count still tells the whole story for a screen reader.
		expect(idle.container.querySelector('.page-list__toggle')?.getAttribute('aria-label')).toBe(
			'2 pages in this chat, 1 waiting for a turn',
		)
	})

	it('shows the busy wording while the first page is being captured', () => {
		const { container } = renderToggle([], { busy: true })
		expect(container.querySelector('.page-list--empty')?.textContent).toMatch(/Adding the page/)
	})
})

describe('PageList', () => {
	it('lists every page as a row with its host', () => {
		const { container } = render(
			<PageList pages={[page({ messageId: 'msg-1' }), desk]} onOpen={vi.fn()} onRemove={vi.fn()} />,
		)

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

	it('brings the page of a row back', () => {
		const onOpen = vi.fn()
		const { container } = render(
			<PageList pages={[page({ messageId: 'msg-1' }), desk]} onOpen={onOpen} onRemove={vi.fn()} />,
		)
		const row = container.querySelectorAll<HTMLButtonElement>('.page-chip')[1]
		if (row) fireEvent.click(row)
		expect(onOpen).toHaveBeenCalledWith(desk)
	})

	it('offers a trash can only while a page has not reached a turn', () => {
		const sent = page({ messageId: 'msg-1' })
		const { container } = render(<PageList pages={[sent, desk]} onOpen={vi.fn()} onRemove={vi.fn()} />)

		expect(container.querySelectorAll('.page-list__item--pending')).toHaveLength(1)
		expect(container.querySelectorAll('.page-list__remove')).toHaveLength(1)
		const row = container.querySelectorAll<HTMLLIElement>('.page-list__item')[1]
		expect(row?.classList.contains('page-list__item--pending')).toBe(true)
	})

	it('removes the page the trash can belongs to', () => {
		const onRemove = vi.fn()
		const { container } = render(<PageList pages={[desk]} onOpen={vi.fn()} onRemove={onRemove} />)
		const remove = container.querySelector<HTMLButtonElement>('.page-list__remove')
		expect(remove?.getAttribute('aria-label')).toBe('Remove Standing desk from this chat')
		if (remove) fireEvent.click(remove)
		expect(onRemove).toHaveBeenCalledWith(desk)
	})
})
