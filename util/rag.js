import { pipeline, env, AutoTokenizer } from '../vendor/@huggingface/transformers.js'
import * as modelsConfig from '../config-transformers.js.js'

// Prevent transformers.js from downloading models from the internet,
// which would violate the Chrome Extension's Content Security Policy.
env.allowRemoteModels = false
env.useBrowserCache = false
env.allowLocalModels = true

// Set the local model path to the absolute URL of the 'runtime' directory within the extension.
// This is necessary because the page has a <base> tag that would otherwise interfere with relative paths.
if (typeof chrome?.runtime?.getURL === 'function') {
    env.localModelPath = chrome.runtime.getURL(modelsConfig.MODELS_DIR)
    if (env.backends?.onnx?.wasm) {
        env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL(modelsConfig.RUNTIME_DIR)
    }
}

async function isWebGPUAvailable() {
    try {
        const adapter = await navigator.gpu?.requestAdapter()
        return !!adapter
    } catch (e) {
        console.error('Error checking for WebGPU availability:', e)
        return false
    }
}

export class Embedder {
    constructor(model = modelsConfig.embedding.model) {
        this.model = model
    }

    async init() {
        const device = (await isWebGPUAvailable()) ? 'webgpu' : 'wasm'
        const tokenizer = await AutoTokenizer.from_pretrained(this.model)
        this.extractor = await pipeline('feature-extraction', this.model, {
            dtype: modelsConfig.embedding.dtype, // Load the non-quantized model
            pooling: 'mean',
            normalize: true,
            revision: 'default',
            tokenizer,
            device,
        })
    }

    async getVector(text) {
        // We need to perform pooling and normalization to get a sentence-level embedding.
        return await this.extractor(text, { pooling: 'mean', normalize: true })
    }

    async getVectorArray(text) {
        const vector = await this.getVector(text)
        return Array.from(vector.data)
    }
}

class Chunk {
    text
    meta

    constructor(text, meta) {
        this.text = text
        this.meta = {
            ...meta,
            id: crypto.randomUUID(),
        }
    }

    getSimilarity(otherEmbedding) {
        return Chunk.cosineSimilarity(this.meta.embedding, otherEmbedding)
    }

    static cosineSimilarity(vector1, vector2) {
        let dotProduct = 0
        let normA = 0
        let normB = 0
        for (let i = 0; i < vector1.length; i++) {
            dotProduct += vector1[i] * vector2[i]
            normA += vector1[i] * vector1[i]
            normB += vector2[i] * vector2[i]
        }

        const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
        if (magnitude === 0) {
            return 0
        }

        return dotProduct / magnitude
    }

    toString() {
        return this.text
    }
}

export class VectorStore {
    chunks = []
    embedder

    constructor(embedder) {
        if (!(embedder instanceof Embedder)) {
            throw new TypeError(`Expected an Embedder. Got ${embedder} (${typeof embedder})`)
        }
        this.embedder = embedder
    }

    async add(text, meta = {}) {
        const embedding = await this.embedder.getVectorArray(text)
        const chunk = new Chunk(text, { ...meta, embedding })
        this.chunks.push(chunk)
    }

    async addArray(chunks, meta = {}) {
        if (!Array.isArray(chunks)) {
            throw new TypeError(`Expected an array. Got ${chunks} (${typeof chunks})`)
        }

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i]
            const chunkMeta = { ...meta, chunkIndex: i }
            if (i > 0) {
                chunkMeta.previousIndex = i - 1
            }
            if (i < chunks.length - 1) {
                chunkMeta.nextIndex = i + 1
            }
            await this.add(chunk, chunkMeta)
        }
    }

    async search(prompt, k = 5, scoreThreshold = 0.7) {
        const queryEmbedding = await this.embedder.getVectorArray(prompt)
        const results = this.chunks.map((chunk) => {
            const similarity = chunk.getSimilarity(queryEmbedding)
            return { chunk, similarity }
        })
        results.sort((r1, r2) => r2.similarity - r1.similarity)
        return results.filter((r) => r.similarity >= scoreThreshold).slice(0, k)
    }

    async query(prompt, k, scoreThreshold) {
        const results = await this.search(prompt, k, scoreThreshold)
        return results.map((result) => result.chunk.text)
    }

    get isEmpty() {
        return this.chunks.length === 0
    }

    empty() {
        this.chunks.length = 0
    }
}
