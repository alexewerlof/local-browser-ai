import { Store } from '../core/store'

export const draftStore = new Store('')
/** The prompt template the draft came from, shown as a badge once the turn is sent. */
export const promptTemplateStore = new Store<string | null>(null)
/** Set while a page is being captured, so the UI can show progress. */
export const addPageBusyStore = new Store(false)
export const addPageErrorStore = new Store<string | null>(null)

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
	promptTemplateStore.set(null)
}
