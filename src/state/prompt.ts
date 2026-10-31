import { Store } from '../core/store'
import { getPromptApiStatus, warmUpPromptModel } from '../providers/prompt-status'
import type { PromptApiStatus } from '../providers/types'

export const promptStatusStore = new Store<PromptApiStatus | null>(null)
export const promptStatusLoading = new Store(false)
export const downloadProgressStore = new Store<number | null>(null)

export async function refreshPromptStatus(): Promise<void> {
	if (promptStatusLoading.get()) return
	promptStatusLoading.set(true)
	try {
		promptStatusStore.set(await getPromptApiStatus())
	} finally {
		promptStatusLoading.set(false)
	}
}

/** Download/warm the built-in model, reporting progress in the range 0..1. */
export async function preparePromptModel(): Promise<PromptApiStatus | null> {
	downloadProgressStore.set(0)
	try {
		const status = await warmUpPromptModel((progress) => downloadProgressStore.set(progress))
		promptStatusStore.set(status)
		return status
	} catch (error) {
		promptStatusStore.set({
			availability: 'unavailable',
			message: error instanceof Error ? error.message : String(error),
		})
		return null
	} finally {
		downloadProgressStore.set(null)
	}
}
