import { Readability } from '../vendor/@mozilla/readability.js'
import { html2markdown, splitByHeaders } from '../util/markdown.js'
import { Frag, registerComponent } from '../util/Wrapper.js'
import { ChatMessage } from './chat-message.js'
import { ImportedPage } from './imported-page.js'
import { Embedder, VectorStore } from '../util/rag.js'

export class ChatThread extends HTMLElement {
    vectorStore
    embedder
    wrappedShadow

    constructor() {
        super()
        this.wrappedShadow = this.initShadow()
    }

    async initRAG() {
        if (!this.embedder) {
            this.embedder = new Embedder()
            console.debug('Initializing embedder...')
            await this.embedder.init()
            console.debug('Embedded initialized')
        }
        if (!this.vectorStore) {
            console.debug('Creating VectorStore')
            this.vectorStore = new VectorStore(this.embedder)
            console.debug('VectorStore created')
        }
    }

    appendChatMessage(child) {
        if (!(child instanceof ChatMessage)) {
            throw new TypeError(`Expected ChatMessage. Got: ${child} (${typeof child})`)
        }
        this.wrappedShadow.append(child)
    }

    async appendImportedPage(importedPage) {
        if (!(importedPage instanceof ImportedPage)) {
            throw new TypeError(`Expected ImportedPage. Got: ${importedPage} (${typeof importedPage})`)
        }
        this.wrappedShadow.append(importedPage)

        try {
            importedPage.update(1, 'Processing html')
            const parser = new DOMParser()
            importedPage.update(5, 'Parsing')
            const doc = parser.parseFromString(importedPage.pageHtml, 'text/html')
            importedPage.update(20, 'Readability analysis')
            const article = new Readability(doc).parse()
            let readableMd = ''
            if (article) {
                importedPage.update(30, 'Converting to Markdown')
                readableMd = html2markdown(article.content)
            } else {
                console.warn('Readability failed to parse content. Falling back to converting the original HTML.')
                readableMd = html2markdown(importedPage.pageHtml)
            }

            importedPage.update(50, 'Chunking')
            const chunks = splitByHeaders(readableMd, { minChunkSize: 200 })

            console.log(`Got ${chunks.length} chunks`)
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i]
                const progress = 50 + Math.round(((i + 1) / chunks.length) * 50)
                importedPage.update(progress, `Embedding chunk ${i + 1}/${chunks.length}`)
                console.time('Add chunk')
                await this.vectorStore.add(chunk)
                console.timeEnd('Add chunk')
            }
            importedPage.update(100, `Extracted ${chunks.length} chunks`)
        } catch (error) {
            this.status = `Error processing HTML: ${error}`
            throw error
        }
    }

    async addContext(prompt, k, scoreThreshold) {
        console.debug(`Adding context to ${prompt}, k = ${k}, Threshold = ${scoreThreshold}`)
        if (this.vectorStore.length === 0) {
            console.debug('Vector Store is empty')
            return prompt
        }
        const results = await this.vectorStore.query(prompt, k, scoreThreshold)
        if (results.length === 0) {
            console.debug('No relevant chunks found')
            return prompt
        }
        console.log(`${results.length} RAG context:`, ...results)
        return `Context:\n${results.join('\n\n')}\n\nQuestion:\n${prompt}`
    }
}

await registerComponent('chat-thread', ChatThread, import.meta.url)
