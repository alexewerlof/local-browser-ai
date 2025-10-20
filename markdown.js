import { TurndownService } from './vendor/turndown.js'

const turndownService = new TurndownService({
    codeBlockStyle: 'fenced',
    hr: '---',
})

turndownService.remove('script')
turndownService.remove('style')
turndownService.remove('noscript')
turndownService.remove('svg')
turndownService.remove('link')
turndownService.remove('meta')

// Remove links that have no text or only whitespace
turndownService.addRule('emptyLink', {
    filter: 'a',
    replacement(content, node) {
        return node.textContent.trim() ? content : ''
    },
})

export function html2markdown(htmlString) {
    return turndownService.turndown(htmlString)
}
