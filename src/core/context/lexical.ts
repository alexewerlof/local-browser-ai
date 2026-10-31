/** Lexical retrieval (BM25) over page chunks. No embeddings, no model download. */

const STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'be',
	'but',
	'by',
	'for',
	'from',
	'has',
	'have',
	'how',
	'i',
	'if',
	'in',
	'into',
	'is',
	'it',
	'its',
	'of',
	'on',
	'or',
	'that',
	'the',
	'their',
	'then',
	'there',
	'these',
	'they',
	'this',
	'to',
	'was',
	'were',
	'what',
	'when',
	'where',
	'which',
	'who',
	'why',
	'will',
	'with',
	'you',
	'your',
])

export function tokenize(text: string): string[] {
	const matches = text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)
	if (!matches) return []
	return matches.filter((token) => !STOP_WORDS.has(token))
}

export interface LexicalDocument {
	id: string
	text: string
}

export interface RankedDocument {
	id: string
	score: number
}

/**
 * Rank documents against a query with Okapi BM25.
 *
 * Tuned for short web sections: a low `b` keeps long code-heavy sections from being
 * penalised too hard, and a small `k` keeps the injected context focused.
 */
export function bm25Rank(documents: LexicalDocument[], query: string, k = 4): RankedDocument[] {
	const queryTerms = [...new Set(tokenize(query))]
	if (queryTerms.length === 0 || documents.length === 0) return []

	const tokenized = documents.map((document) => tokenize(document.text))
	const averageLength =
		tokenized.reduce((total, tokens) => total + tokens.length, 0) / Math.max(1, tokenized.length || 1)

	const documentFrequency = new Map<string, number>()
	for (const term of queryTerms) {
		let frequency = 0
		for (const tokens of tokenized) {
			if (tokens.includes(term)) frequency += 1
		}
		documentFrequency.set(term, frequency)
	}

	const k1 = 1.2
	const b = 0.6
	const total = documents.length
	const scored: RankedDocument[] = []

	tokenized.forEach((tokens, index) => {
		const counts = new Map<string, number>()
		for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)

		let score = 0
		for (const term of queryTerms) {
			const termFrequency = counts.get(term) ?? 0
			if (termFrequency === 0) continue
			const frequency = documentFrequency.get(term) ?? 0
			const idf = Math.log(1 + (total - frequency + 0.5) / (frequency + 0.5))
			const denominator = termFrequency + k1 * (1 - b + (b * tokens.length) / Math.max(1, averageLength))
			score += idf * ((termFrequency * (k1 + 1)) / denominator)
		}

		const id = documents[index]?.id
		if (id && score > 0) scored.push({ id, score })
	})

	return scored.sort((a, b) => b.score - a.score).slice(0, k)
}
