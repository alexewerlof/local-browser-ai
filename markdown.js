import { TurndownService } from './vendor/turndown.js'
import { MarkdownIt } from './vendor/markdown-it.js'

const turndownService = new TurndownService({
    codeBlockStyle: 'fenced',
    hr: '---',
})

turndownService.remove('script')
turndownService.remove('button')
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

const md2html = MarkdownIt()

// Get the default link renderer to extend it
const defaultRender =
    md2html.renderer.rules.link_open ||
    function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options)
    }

// Add target="_blank" and rel="noopener noreferrer" to all links
md2html.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const targetAttr = ['target', '_blank']
    const relAttr = ['rel', 'noopener noreferrer']

    tokens[idx].attrPush(targetAttr)
    tokens[idx].attrPush(relAttr)

    // pass token to default renderer.
    return defaultRender(tokens, idx, options, env, self)
}

export function markdown2html(markdownString) {
    return md2html.render(markdownString)
}
