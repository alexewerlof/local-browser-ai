// Mock chrome global before importing rag.js
globalThis.chrome = {
    runtime: {
        getURL: (path) => `chrome-extension://mock-id/${path}`,
    },
}

import { describe, it, mock } from 'node:test'
import assert from 'node:assert'

// Dynamic import to ensure chrome is mocked first
const { VectorStore, Embedder } = await import('./rag.js')

// Mock Embedder to avoid loading actual models
class MockEmbedder extends Embedder {
    constructor() {
        super()
    }

    async init() {}

    async getVectorArray(text) {
        // Simple mock: return a vector based on text length or some other deterministic property
        // For simplicity, let's return a unit vector where the index corresponds to the first char code % 3
        const vec = [0, 0, 0]
        const index = text.charCodeAt(0) % 3
        vec[index] = 1
        return vec
    }
}

describe('VectorStore', () => {
    it('should add chunks and search by similarity', async () => {
        const embedder = new MockEmbedder()
        const store = new VectorStore(embedder)

        await store.add('apple') // charCode('a') = 97, 97 % 3 = 1 -> [0, 1, 0]
        await store.add('banana') // charCode('b') = 98, 98 % 3 = 2 -> [0, 0, 1]
        await store.add('apricot') // charCode('a') = 97, 97 % 3 = 1 -> [0, 1, 0]

        // Query with 'avocado' (starts with 'a') -> [0, 1, 0]
        // Should match 'apple' and 'apricot' with similarity 1, 'banana' with similarity 0
        const results = await store.search('avocado', 3)

        assert.strictEqual(results.length, 3)
        assert.strictEqual(results[0].similarity, 1)
        assert.strictEqual(results[1].similarity, 1)
        assert.strictEqual(results[2].similarity, 0)

        // Check text content (order of identical similarity is stable or depends on implementation,
        // but we know apple and apricot are top 2)
        const topTexts = results
            .slice(0, 2)
            .map((r) => r.chunk.text)
            .sort()
        assert.deepStrictEqual(topTexts, ['apple', 'apricot'])
    })

    it('should filter by scoreThreshold', async () => {
        const embedder = new MockEmbedder()
        const store = new VectorStore(embedder)

        await store.add('apple') // [0, 1, 0]
        await store.add('banana') // [0, 0, 1]

        // Query 'avocado' -> [0, 1, 0]
        // apple: 1.0, banana: 0.0

        // Threshold 0.5 should exclude banana
        const results = await store.search('avocado', 5, 0.5)

        assert.strictEqual(results.length, 1)
        assert.strictEqual(results[0].chunk.text, 'apple')
    })

    it('should pass scoreThreshold via query method', async () => {
        const embedder = new MockEmbedder()
        const store = new VectorStore(embedder)

        await store.add('apple')
        await store.add('banana')

        const results = await store.query('avocado', 5, 0.5)

        assert.strictEqual(results.length, 1)
        assert.strictEqual(results[0], 'apple')
    })
})
