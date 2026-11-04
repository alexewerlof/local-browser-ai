import { beforeEach, describe, expect, it } from 'vitest'
import {
	bindQueue,
	clearQueue,
	enqueuePrompt,
	flushQueuePersistence,
	loadQueueFor,
	queueStore,
	removeQueuedPrompt,
	restorePromptFront,
	takeNextQueuedPrompt,
} from './queue'
import { clearConversations, deleteConversation, loadQueue } from './database'

/** Each test gets a clean database and a store bound to its own conversation. */
async function useQueue(conversationId: string): Promise<void> {
	await flushQueuePersistence()
	await clearConversations()
	bindQueue(conversationId)
}

const texts = (): string[] => queueStore.get().map((item) => item.text)

describe('prompt queue', () => {
	beforeEach(async () => {
		await flushQueuePersistence()
		await clearConversations()
	})

	it('trims prompts and ignores blank ones', async () => {
		await useQueue('queue-blank')

		expect(await enqueuePrompt('queue-blank', '   ')).toBeNull()
		expect(queueStore.get()).toHaveLength(0)

		const item = await enqueuePrompt('queue-blank', '  hello  ', 'skill-1')
		expect(item?.text).toBe('hello')
		expect(item?.skillId).toBe('skill-1')
		expect(texts()).toEqual(['hello'])
	})

	it('drains in the order the prompts were queued', async () => {
		await useQueue('queue-fifo')
		await enqueuePrompt('queue-fifo', 'first')
		await enqueuePrompt('queue-fifo', 'second')

		expect((await takeNextQueuedPrompt('queue-fifo'))?.text).toBe('first')
		expect((await takeNextQueuedPrompt('queue-fifo'))?.text).toBe('second')
		expect(await takeNextQueuedPrompt('queue-fifo')).toBeNull()
		expect(queueStore.get()).toHaveLength(0)
	})

	it('returns a removed prompt so the composer can restore it', async () => {
		await useQueue('queue-remove')
		const keep = await enqueuePrompt('queue-remove', 'keep me')
		const edit = await enqueuePrompt('queue-remove', 'edit me')

		const removed = await removeQueuedPrompt('queue-remove', edit!.id)
		expect(removed?.text).toBe('edit me')
		expect(queueStore.get().map((item) => item.id)).toEqual([keep!.id])
		expect(await removeQueuedPrompt('queue-remove', 'missing')).toBeNull()
	})

	it('keeps one queue per conversation', async () => {
		await useQueue('queue-a')
		await enqueuePrompt('queue-a', 'for A')

		bindQueue('queue-b')
		await enqueuePrompt('queue-b', 'for B')
		expect(texts()).toEqual(['for B'])

		await loadQueueFor('queue-a')
		expect(texts()).toEqual(['for A'])
	})

	it('refuses to take from a queue that is not on screen', async () => {
		await useQueue('queue-owner')
		await enqueuePrompt('queue-owner', 'mine')
		bindQueue('queue-other')

		expect(await takeNextQueuedPrompt('queue-owner')).toBeNull()
		expect(queueStore.get()).toHaveLength(0)
		// The stored queue is untouched by the refused take.
		expect((await loadQueue('queue-owner')).map((item) => item.text)).toEqual(['mine'])
	})

	it('puts a taken prompt back at the front', async () => {
		await useQueue('queue-restore')
		await enqueuePrompt('queue-restore', 'first')
		await enqueuePrompt('queue-restore', 'second')
		const taken = await takeNextQueuedPrompt('queue-restore')

		await restorePromptFront('queue-restore', taken!)
		expect(texts()).toEqual(['first', 'second'])
	})

	it('clears the queue and its stored record', async () => {
		await useQueue('queue-clear')
		await enqueuePrompt('queue-clear', 'pending')

		await clearQueue('queue-clear')
		expect(queueStore.get()).toHaveLength(0)
		expect(await loadQueue('queue-clear')).toEqual([])
	})

	it('drops the queue when its conversation is deleted', async () => {
		await useQueue('queue-delete')
		await enqueuePrompt('queue-delete', 'orphan')

		await deleteConversation('queue-delete')
		expect(await loadQueue('queue-delete')).toEqual([])
	})
})
