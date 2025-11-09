import { TurndownService } from './vendor/turndown.js'
import { MarkdownIt } from './vendor/markdown-it.js'
import { gfm } from './vendor/turndown-plugin-gfm.js'

const turndownService = new TurndownService({
    codeBlockStyle: 'fenced',
    hr: '---',
})

turndownService.use(gfm)

turndownService.remove([
    'applet',
    'button',
    'del',
    'embed',
    'frame',
    'frameset',
    'iframe',
    'link',
    'meta',
    'noframes',
    'noscript',
    'object',
    'script',
    'style',
    'svg',
])

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
