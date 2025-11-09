import { Readability } from './vendor/@mozilla/readability.js'
import { Wrapper } from './util/Wrapper.js'
import { html2markdown, markdown2html } from './markdown.js'

class TabSelector {
    tabs

    constructor() {
        this.tabs = Wrapper.queryAll('.tab-content')
        if (this.tabs.length < 1) {
            throw new Error('No tabs found')
        }
        const buttonContainer = Wrapper.query('#tab-selectors')
        if (!buttonContainer) {
            throw new Error('No tab selectors found')
        }
        const createButtonEventListener = (tab) => () => this.select(tab)
        for (const tab of this.tabs) {
            buttonContainer.append(
                new Wrapper('button').setText(tab.getData('title')).onClick(createButtonEventListener(tab)),
            )
        }
        this.select(this.tabs[0])
    }

    select(targetTab) {
        console.log('Selected tab:', targetTab.getData('title'))
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
    const tabSelector = new TabSelector()
    const url = new URL(window.location.href)
    document.title = url.searchParams.get('title')
    const htmlContent = url.searchParams.get('html')

    if (!htmlContent) {
        throw new Error('The "html" query parameter is missing.')
    }

    const inputHtml = decodeURIComponent(htmlContent)
    Wrapper.query('#input').setText(inputHtml)
    Wrapper.query('#input-rendered-as-html').setHtml(inputHtml)
    const inputAsMarkdown = html2markdown(inputHtml)
    Wrapper.query('#input-as-markdown').setText(inputAsMarkdown)

    const parser = new DOMParser()
    const doc = parser.parseFromString(inputHtml, 'text/html')
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
    Wrapper.query('#output-markdown').setText(readabilityAsMarkdown)

    const htmlFromMarkdown = markdown2html(readabilityAsMarkdown)
    Wrapper.query('#output-rendered-markdown').setHtml(htmlFromMarkdown)

    return 'Finished main successfully'
}

main().then(console.log).catch(console.error)
