import { beforeEach, describe, expect, it } from 'vitest'
import type { ChatMessage, Conversation } from '../core/types'
import { createId } from '../core/util'
import { commit, conversationStore, createConversation, flushPersistence, openConversation } from './chat'
import { clearConversations, listConversations, saveConversation } from './database'

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
