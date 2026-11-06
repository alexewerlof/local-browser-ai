// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { ChatMessage, Conversation, PageSnapshot } from '../core/types'
import { freezePage } from '../core/context/page-block'
import { createId } from '../core/util'
import {
	appendPage,
	commit,
	conversationStore,
	createConversation,
	flushPersistence,
	openConversation,
	queuePausedStore,
	restoreLastConversation,
	resumeQueue,
} from './chat'
import {
	clearConversations,
	deleteConversation,
	listConversations,
	loadPages,
	saveConversation,
	savePage,
} from './database'
import { clearOpenChatId, readOpenChatId, writeOpenChatId } from './panel-state'
import { bindPages, pagesStore } from './pages'
import { bindQueue, enqueuePrompt, queueStore, removeQueuedPrompt } from './queue'

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

describe('restoreLastConversation', () => {
	beforeEach(async () => {
		await flushPersistence()
		await clearConversations()
		// jsdom has no `chrome.storage`, so the key lands in localStorage.
		localStorage.clear()
		commit(createConversation(null))
		bindPages([])
		bindQueue(conversationStore.get().id)
		// Every test starts from "the panel has never been closed".
		await clearOpenChatId()
	})

	it('reopens the chat that was on screen, with its transcript and pages', async () => {
		const stored = savedChat('Earlier chat', [message('hello', 1_000)])
		await saveConversation(stored)
		const entry = page(stored.id, 'p1', 'https://example.com/a', 1_000)
		await savePage({ ...entry, messageId: 'msg-1' })
		await writeOpenChatId(stored.id)

		await restoreLastConversation()

		expect(conversationStore.get().id).toBe(stored.id)
		expect(conversationStore.get().title).toBe('Earlier chat')
		expect(conversationStore.get().messages).toHaveLength(1)
		expect(pagesStore.get().map((restored) => restored.handle)).toEqual(['p1'])
		// A page that already reached a turn stays claimed, so no later turn carries it again.
		expect(pagesStore.get()[0]?.messageId).toBe('msg-1')
	})

	it('starts a new chat when the remembered chat is gone', async () => {
		const fresh = conversationStore.get().id
		await writeOpenChatId('chat-missing')

		await restoreLastConversation()

		expect(conversationStore.get().id).toBe(fresh)
		expect(await readOpenChatId()).toBeNull()
	})

	it('does nothing when the chat is already on screen', async () => {
		const current = conversationStore.get()
		// A stored copy that would be visible if the chat were reloaded from the database.
		await saveConversation({ ...current, title: 'Saved copy' })
		await writeOpenChatId(current.id)

		await restoreLastConversation()

		expect(conversationStore.get().title).toBe('New chat')
	})

	it('parks a restored queue instead of running it', async () => {
		const stored = savedChat('Queued chat', [message('hello', 1_000)])
		await saveConversation(stored)
		await bindQueue(stored.id)
		await enqueuePrompt(stored.id, 'run me later')
		await writeOpenChatId(stored.id)

		await restoreLastConversation()

		expect(queueStore.get().map((item) => item.text)).toEqual(['run me later'])
		// Opening the panel must never spend a request on its own: Continue is the decision.
		expect(queuePausedStore.get()).toBe(true)

		// With nothing left to run, Continue only clears the pause.
		await removeQueuedPrompt(stored.id, queueStore.get()[0]?.id ?? '')
		resumeQueue()
		expect(queuePausedStore.get()).toBe(false)
	})

	it('leaves the queue running when the restored chat has nothing queued', async () => {
		const stored = savedChat('Quiet chat', [message('hello', 1_000)])
		await saveConversation(stored)
		await writeOpenChatId(stored.id)

		await restoreLastConversation()

		expect(queuePausedStore.get()).toBe(false)
	})
})

describe('open chat memory', () => {
	beforeEach(async () => {
		await flushPersistence()
		await clearConversations()
		localStorage.clear()
		commit(createConversation(null))
		await clearOpenChatId()
	})

	it('remembers the chat that is on screen', async () => {
		const chat = savedChat('Remembered', [message('hi', 1_000)])

		commit(chat)

		expect(await readOpenChatId()).toBe(chat.id)
	})

	it('follows a chat switch', async () => {
		const first = savedChat('First', [message('one', 1_000)])
		const second = savedChat('Second', [message('two', 2_000)])
		commit(first)

		commit(second)

		expect(await readOpenChatId()).toBe(second.id)
	})
})
