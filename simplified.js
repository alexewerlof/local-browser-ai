import { Readability } from './vendor/@mozilla/readability.js'
import { JJHE, JJD } from './vendor/jj.js'
import { html2markdown, markdown2html, splitByHeaders } from './util/markdown.js'
import { Embedder, VectorStore } from './util/rag.js'

const jjDoc = JJD.from(document)
const h = JJHE.tree

class TabbedUi {
    tabs

    constructor(jjRoot) {
        if (!(jjRoot instanceof JJHE)) {
            throw new TypeError(`Expected a JJHE. Got ${jjRoot} (${typeof jjRoot})`)
        }
        const jjButtonContainer = h('div', { class: 'tabbed-ui__selectors button-bar' })
        jjRoot.preChild(jjButtonContainer)
        this.tabs = jjRoot.findAll('.tabbed-ui__content')
        if (this.tabs.length < 1) {
            throw new Error(`No tabs found under ${this.jjRoot}`)
        }
        const createButtonEventListener = (tab) => () => this.select(tab)
        jjButtonContainer.addChildMap(this.tabs, (tab) =>
            h('button', null, tab.getDataAttr('title')).on('click', createButtonEventListener(tab)),
        )
        this.select(this.tabs[0])
    }

    select(targetTab) {
        console.log('Selected tab:', targetTab.getDataAttr('title'))
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
    jjDoc.findAll('.copy-to-clipboard').forEach((jjButton) => {
        jjButton.on('click', (evt) => {
            const targetId = JJHE.from(evt.target).getDataAttr('targetId')
            const jjTarget = jjDoc.find(`#${targetId}`, true)
            navigator.clipboard.writeText(jjTarget.getText()).catch(console.error)
        })
    })
    const tabSelector = new TabbedUi(jjDoc.find('#tabbed-ui', true))
    const url = new URL(window.location.href)
    document.title = url.searchParams.get('title')

    jjDoc.find('base', true).setAttrs({
        href: url.searchParams.get('base'),
        target: '_blank',
    })

    const sourceUrl = url.searchParams.get('source')
    jjDoc
        .find('#source-url', true)
        .setAttrs({
            href: sourceUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
        })
        .setText(sourceUrl)

    const htmlContent = url.searchParams.get('html')

    if (!htmlContent) {
        throw new Error('The "html" query parameter is missing.')
    }

    jjDoc.find('#input', true).setText(htmlContent)
    jjDoc.find('#input-rendered-as-html', true).setHTML(htmlContent, true)
    const inputAsMarkdown = html2markdown(htmlContent)
    jjDoc.find('#input-as-markdown', true).setText(inputAsMarkdown)

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
    jjDoc.find('#output-readability', true).setHTML(readabilityHtml, true)

    const readabilityAsMarkdown = html2markdown(article.content)
    jjDoc.find('#output-markdown', true).setText(readabilityAsMarkdown)

    const htmlFromMarkdown = markdown2html(readabilityAsMarkdown)
    jjDoc.find('#output-rendered-markdown', true).setHTML(htmlFromMarkdown, true)

    const chunks = splitByHeaders(readabilityAsMarkdown)
    jjDoc.find('#output-chunked', true).addChildMap(chunks, (chunk) => h('section', null, chunk))

    const embedder = new Embedder()
    await embedder.init()

    const vectorStore = new VectorStore(embedder)
    for (const chunk of chunks) {
        console.time('Add chunk')
        await vectorStore.add(chunk)
        console.timeEnd('Add chunk')
    }

    const query = await vectorStore.query('Chrome', 5)
    console.log(query)

    return 'Finished main successfully'
}

main().then(console.log).catch(console.error)
