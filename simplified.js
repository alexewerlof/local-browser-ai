import { Readability } from './vendor/@mozilla/readability.js'
import { Wrapper } from './util/Wrapper.js'
import { html2markdown, markdown2html, splitByHeaders } from './util/markdown.js'
import { Embedder, VectorStore } from './util/rag.js'

class TabbedUi {
    tabs

    constructor(root) {
        if (!(root instanceof Wrapper)) {
            throw new TypeError(`Expected a Wrapper. Got ${root} (${typeof root})`)
        }
        const buttonContainer = new Wrapper('div').addClass('tabbed-ui__selectors', 'button-bar')
        root.prepend(buttonContainer)
        this.tabs = root.byClass('tabbed-ui__content')
        if (this.tabs.length < 1) {
            throw new Error(`No tabs found under ${this.root}`)
        }
        const createButtonEventListener = (tab) => () => this.select(tab)
        buttonContainer.mapAppend(this.tabs, (tab) =>
            new Wrapper('button').setText(tab.getData('title')).onClick(createButtonEventListener(tab)),
        )
        this.select(this.tabs[0])
    }

    select(targetTab) {
        console.log('Selected tab:', targetTab.getData('title'))
        if (!this.tabs.includes(targetTab)) {
            throw new RangeError(`Invalid tab: ${targetTab}`)
        }
        for (const tab of this.tabs) {
            if (tab === targetTab) {
                tab.show()
            } else {
                tab.hide()
            }
        }
    }
}

async function main() {
    Wrapper.byClass('copy-to-clipboard').forEach((button) => {
        button.onClick((evt) => {
            const targetId = new Wrapper(evt.target).getData('targetId')
            const target = Wrapper.byId(targetId)
            navigator.clipboard.writeText(target.getText()).catch(console.error)
        })
    })
    const tabSelector = new TabbedUi(Wrapper.byId('tabbed-ui'))
    const url = new URL(window.location.href)
    document.title = url.searchParams.get('title')

    Wrapper.query('base').setAttr('href', url.searchParams.get('base')).setAttr('target', '_blank')

    const sourceUrl = url.searchParams.get('source')
    Wrapper.byId('source-url')
        .setAttr('href', sourceUrl)
        .setAttr('target', '_blank')
        .setAttr('rel', 'noopener noreferrer')
        .setText(sourceUrl)

    const htmlContent = url.searchParams.get('html')

    if (!htmlContent) {
        throw new Error('The "html" query parameter is missing.')
    }

    Wrapper.byId('input').setText(htmlContent)
    Wrapper.byId('input-rendered-as-html').setHtml(htmlContent)
    const inputAsMarkdown = html2markdown(htmlContent)
    Wrapper.byId('input-as-markdown').setText(inputAsMarkdown)

    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlContent, 'text/html')
    const article = new Readability(doc).parse()
    if (!article || typeof article !== 'object') {
        throw new Error('Readability could not parse article')
    }
    const readabilityHtml = article.content
    if (!readabilityHtml) {
        throw new Error('Readability returned an empty article')
    }
    Wrapper.query(`#output-readability`).setHtml(readabilityHtml)

    const readabilityAsMarkdown = html2markdown(article.content)
    Wrapper.byId('output-markdown').setText(readabilityAsMarkdown)

    const htmlFromMarkdown = markdown2html(readabilityAsMarkdown)
    Wrapper.byId('output-rendered-markdown').setHtml(htmlFromMarkdown)

    const chunks = splitByHeaders(readabilityAsMarkdown)
    Wrapper.byId('output-chunked').mapAppend(chunks, (chunk) => new Wrapper('section').setText(chunk))

    const embedder = new Embedder()
    await embedder.init()

    const vectorStore = new VectorStore(embedder)
    for (const chunk of chunks) {
        console.time('Add chunk')
        await vectorStore.add(chunk)
        console.timeEnd('Add chunk')
    }

    const query = await vectorStore.search('Chrome', 5)
    console.log(query)

    return 'Finished main successfully'
}

main().then(console.log).catch(console.error)
