import { pipeline, env, AutoTokenizer } from '../vendor/@huggingface/transformers.js'
import * as modelsConfig from '../modelsconfig.js'

// Prevent transformers.js from downloading models from the internet,
// which would violate the Chrome Extension's Content Security Policy.
env.allowRemoteModels = false
env.useBrowserCache = false
env.allowLocalModels = true

// Set the local model path to the absolute URL of the 'runtime' directory within the extension.
// This is necessary because the page has a <base> tag that would otherwise interfere with relative paths.
env.localModelPath = chrome.runtime.getURL('models/')
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('runtime/')

export class Embedder {
    constructor(model = modelsConfig.embedding.model) {
        this.model = model
    }

    async init() {
        const tokenizer = await AutoTokenizer.from_pretrained(this.model)
        this.extractor = await pipeline('feature-extraction', this.model, {
            dtype: modelsConfig.embedding.dtype, // Load the non-quantized model
            pooling: 'mean',
            normalize: true,
            revision: 'default',
            tokenizer,
            // device: 'webgpu',
        })
    }

    async getVector(text) {
        return this.extractor(text)
    }
}

export class VectorStore {
    _data = []
    embedder

    constructor(embedder) {
        if (!(embedder instanceof Embedder)) {
            throw new TypeError(`Expected an Embedder. Got ${embedder} (${typeof embedder})`)
        }
        this.embedder = embedder
    }

    add(chunk, embedding) {
        this._data.push({ chunk, embedding })
    }

    async search(query, k = 5) {
        const queryEmbedding = await this.embedder.getVector(query)
        const results = this._data.map((item) => {
            const { chunk, embedding } = item
            const similarity = VectorStore.cosineSimilarity(embedding, queryEmbedding)
            return { chunk, similarity }
        })
        results.sort((a, b) => b.similarity - a.similarity)
        return results.slice(0, k).map((result) => result.chunk)
    }

    static cosineSimilarity(vector1, vector2) {
        if (!Array.isArray(vector1) || !Array.isArray(vector2)) {
            throw new TypeError('Both vectors must be arrays')
        }
        if (vector1.length !== vector2.length) {
            throw new Error('Vectors must have the same length')
        }
        let dotProduct = 0
        let normA = 0
        let normB = 0
        for (let i = 0; i < vector1.length; i++) {
            dotProduct += vector1[i] * vector2[i]
            normA += vector1[i] * vector1[i]
            normB += vector2[i] * vector2[i]
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
    }
}
