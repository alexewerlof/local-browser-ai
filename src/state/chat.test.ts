import { beforeEach, describe, expect, it } from 'vitest'
import type { ChatMessage, Conversation, PageSnapshot } from '../core/types'
import { freezePage } from '../core/context/page-block'
import { createId } from '../core/util'
import { appendPage, commit, conversationStore, createConversation, flushPersistence, openConversation } from './chat'
import {
	clearConversations,
	deleteConversation,
	listConversations,
	loadPages,
	saveConversation,
	savePage,
} from './database'
import { bindPages, pagesStore } from './pages'

function message(text: string, createdAt: number): ChatMessage {
	return {
		id: createId('msg'),
		role: 'user',
		parts: [{ type: 'text', text }],
		createdAt,
		status: 'complete',
	}
}

function savedChat(title: string, messages: ChatMessage[], updatedAt?: number): Conversation {
	const conversation = createConversation(null)
	conversation.title = title
	conversation.messages = messages
	if (updatedAt !== undefined) conversation.updatedAt = updatedAt
	return conversation
}

describe('openConversation', () => {
	beforeEach(async () => {
		await flushPersistence()
		await clearConversations()
		commit(createConversation(null))
	})

	it('loads the saved transcript into the panel', async () => {
		const stored = savedChat('Earlier chat', [message('hello', 1_000)])
		await saveConversation(stored)

		await openConversation(stored.id)

		expect(conversationStore.get().id).toBe(stored.id)
		expect(conversationStore.get().title).toBe('Earlier chat')
		expect(conversationStore.get().messages).toHaveLength(1)
	})

	it('keeps the chat that was open in history', async () => {
		const stored = savedChat('Earlier chat', [message('hello', 1_000)])
		await saveConversation(stored)

		const live = savedChat('Live chat', [message('still here', 2_000)])
		commit(live)

		await openConversation(stored.id)

		expect(conversationStore.get().id).toBe(stored.id)
		const ids = (await listConversations()).map((entry) => entry.id)
		expect(ids).toContain(live.id)
	})

	it('does nothing when the id is unknown', async () => {
		const live = savedChat('Live chat', [message('still here', 2_000)])
		commit(live)

		await openConversation('chat-missing')

		expect(conversationStore.get().id).toBe(live.id)
	})
})

describe('listConversations', () => {
	beforeEach(async () => {
		await flushPersistence()
		await clearConversations()
		commit(createConversation(null))
	})

	it('sorts by the timestamp of the last message, newest first', async () => {
		// Touched later, but its newest message is older than the other chat's.
		const touched = savedChat('Touched later', [message('old', 1_000)], 9_000)
		const recent = savedChat('Recent', [message('new', 5_000)], 5_000)
		await saveConversation(touched)
		await saveConversation(recent)

		const titles = (await listConversations()).map((entry) => entry.title)

		expect(titles).toEqual(['Recent', 'Touched later'])
	})

	it('hides empty chats', async () => {
		await saveConversation(savedChat('Has messages', [message('hi', 1_000)]))

		const titles = (await listConversations()).map((entry) => entry.title)

		expect(titles).toEqual(['Has messages'])
	})
})

function page(conversationId: string, handle: string, url: string, capturedAt: number): PageSnapshot {
	return freezePage(
		{
			id: createId('page'),
			url,
			title: url,
			markdown: '# Title\n\nSome text.',
			outline: [{ id: 'h0', level: 1, text: 'Title', line: 0 }],
			chunks: [{ id: createId('chunk'), heading: 'Title', text: 'Some text.', line: 0 }],
			capturedAt,
			truncated: false,
			totalChars: 20,
		},
		conversationId,
		handle,
	)
}

describe('pages', () => {
	beforeEach(async () => {
		await flushPersistence()
		await clearConversations()
		commit(createConversation(null))
		bindPages([])
	})

	it('stores a page against its chat and loads it back in order', async () => {
		const conversation = conversationStore.get()
		const first = page(conversation.id, 'p1', 'https://example.com/a', 1_000)
		const second = page(conversation.id, 'p2', 'https://example.com/b', 2_000)
		await savePage(second)
		await savePage(first)

		const loaded = await loadPages(conversation.id)

		expect(loaded.map((entry) => entry.handle)).toEqual(['p1', 'p2'])
		expect(loaded[0]?.block).toContain('## Page p1')
	})

	it('keeps the pages of another chat apart', async () => {
		const mine = conversationStore.get()
		await savePage(page(mine.id, 'p1', 'https://example.com/a', 1_000))
		await savePage(page('chat_other', 'p1', 'https://example.com/b', 1_000))

		expect(await loadPages(mine.id)).toHaveLength(1)
		expect((await loadPages(mine.id))[0]?.url).toBe('https://example.com/a')
	})

	it('restores the pages when a chat is reopened', async () => {
		const stored = savedChat('With a page', [message('hello', 1_000)])
		await saveConversation(stored)
		await savePage(page(stored.id, 'p1', 'https://example.com/a', 1_000))

		await openConversation(stored.id)

		expect(pagesStore.get().map((entry) => entry.handle)).toEqual(['p1'])
	})

	it('appends a page to the store without touching the conversation', async () => {
		const conversation = conversationStore.get()
		const entry = page(conversation.id, 'p1', 'https://example.com/a', 1_000)

		await appendPage(entry)

		expect(pagesStore.get().map((pageEntry) => pageEntry.id)).toEqual([entry.id])
		// A page waits for the next turn, so it carries no message id yet.
		expect(pagesStore.get()[0]?.messageId).toBeUndefined()
	})

	it('deletes the pages with their chat', async () => {
		const conversation = conversationStore.get()
		await saveConversation(conversation)
		await savePage(page(conversation.id, 'p1', 'https://example.com/a', 1_000))

		await deleteConversation(conversation.id)

		expect(await loadPages(conversation.id)).toEqual([])
	})

	it('adopts a chat that stored its page inline', async () => {
		// What a chat saved before pages had their own store looks like: one snapshot
		// under `attachments`, no handle, no block, no page record.
		const legacy = {
			...savedChat('Old chat', [message('what does this cost?', 1_000)]),
			attachments: [
				{
					id: createId('page'),
					url: 'https://example.com/legacy',
					title: 'Legacy page',
					markdown: '# Legacy page\n\nIt costs 10 EUR.',
					outline: [{ id: 'h0', level: 1, text: 'Legacy page', line: 0 }],
					chunks: [{ id: createId('chunk'), heading: 'Legacy page', text: 'It costs 10 EUR.', line: 0 }],
					capturedAt: 1_000,
					stale: false,
					truncated: false,
					totalChars: 30,
				},
			],
		}
		await saveConversation(legacy as unknown as Conversation)

		await openConversation(legacy.id)

		const adopted = pagesStore.get()
		expect(adopted).toHaveLength(1)
		expect(adopted[0]?.handle).toBe('p1')
		expect(adopted[0]?.block).toContain('## Page p1 — Legacy page')

		// The block has to reach a turn, or the tools would offer a page nobody saw.
		const userMessage = conversationStore.get().messages.find((entry) => entry.role === 'user')
		expect(userMessage?.parts[0]).toEqual({ type: 'page-ref', pageId: adopted[0]?.id })
		expect(adopted[0]?.messageId).toBe(userMessage?.id)
	})
})
