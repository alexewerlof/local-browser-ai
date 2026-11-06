/**
 * One-line description of the user's language environment.
 *
 * Language applies to every answer, so it belongs in the prompt rather than behind a
 * tool: a model that never calls `get_current_datetime` (or a model without tools at all,
 * such as the built-in Prompt API) still has to know which language to answer in.
 */

export interface EnvironmentInput {
	/** Browser language preferences, most preferred first. Defaults to `navigator.languages`. */
	languages?: readonly string[]
	/** The `lang` of an added page, when one declares it. */
	pageLanguage?: string
}

/** How many of the user's preferred languages are worth naming. */
const MAX_LANGUAGES = 3

export function browserLanguages(): string[] {
	if (typeof navigator === 'undefined') return []
	if (navigator.languages?.length) return [...navigator.languages]
	return navigator.language ? [navigator.language] : []
}

/**
 * Text telling the model which language to answer in. Empty when the browser exposes no
 * language preference, so the caller can skip the context part entirely.
 */
export function describeEnvironment(input: EnvironmentInput = {}): string {
	const languages = (input.languages ?? browserLanguages()).filter(Boolean).slice(0, MAX_LANGUAGES)
	const lines: string[] = []

	if (languages.length) {
		lines.push(`Answer in the language the user writes in; their browser prefers ${languages.join(', ')}.`)
	}

	// Only worth saying when the page is in a language the user does not already prefer.
	const pageLanguage = input.pageLanguage?.trim()
	if (pageLanguage && !speaks(languages, pageLanguage)) {
		lines.push(`A page in this conversation is marked as language "${pageLanguage}".`)
	}

	return lines.join('\n')
}

/** True when one of `languages` uses the same primary subtag as `language`. */
function speaks(languages: readonly string[], language: string): boolean {
	const primary = (value: string) => value.split('-')[0]?.toLowerCase() ?? value.toLowerCase()
	const target = primary(language)
	return languages.some((entry) => primary(entry) === target)
}
