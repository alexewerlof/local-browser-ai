import { Store } from '../core/store'

export const draftStore = new Store('')
export const skillStore = new Store<string | null>(null)
/** Set while a page is being attached, so the UI can show progress. */
export const attachBusyStore = new Store(false)
export const attachErrorStore = new Store<string | null>(null)

export function setDraft(value: string): void {
	draftStore.set(value)
}

/** Append text to the draft at the caret, keeping block separation. */
export function insertIntoDraft(text: string): void {
	const current = draftStore.get()
	if (!current.trim()) {
		draftStore.set(text)
		return
	}
	draftStore.set(`${current.trimEnd()}\n\n${text}`)
}

export function quoteSelection(text: string): void {
	const quoted = text
		.split('\n')
		.map((line) => `> ${line}`)
		.join('\n')
	insertIntoDraft(`${quoted}\n\n`)
}

export function clearComposer(): void {
	draftStore.set('')
	skillStore.set(null)
}
