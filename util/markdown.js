import { TurndownService } from '../vendor/turndown.js'
import { MarkdownIt } from '../vendor/markdown-it.js'
import { gfm } from '../vendor/turndown-plugin-gfm.js'

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

const md = MarkdownIt()

// Get the default link renderer to extend it
const defaultRender =
    md.renderer.rules.link_open ||
    function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options)
    }

// Add target="_blank" and rel="noopener noreferrer" to all links
md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const targetAttr = ['target', '_blank']
    const relAttr = ['rel', 'noopener noreferrer']

    tokens[idx].attrPush(targetAttr)
    tokens[idx].attrPush(relAttr)

    // pass token to default renderer.
    return defaultRender(tokens, idx, options, env, self)
}

export function markdown2html(markdownString) {
    return md.render(markdownString)
}

export function splitByHeaders(markdown) {
    // 1. Parse to get tokens (AST)
    // We don't care about HTML output, just the structure.
    const tokens = md.parse(markdown, {})

    // 2. Find the line numbers where every header starts
    // `token.map[0]` gives the start line index of that token
    const headerStartLines = tokens.filter((token) => token.type === 'heading_open').map((token) => token.map[0])

    // 3. Split the original text by lines so we can slice it easily
    const lines = markdown.split('\n')
    const chunks = []

    let lastStart = 0

    // Loop through header positions to create slices
    // If the first header starts at line 0, this loop runs immediately.
    // If there is text *before* the first header, the first iteration captures it (Intro).
    for (const startLine of headerStartLines) {
        if (startLine > lastStart) {
            chunks.push(lines.slice(lastStart, startLine).join('\n'))
        }
        lastStart = startLine
    }

    // 4. Add the final chunk (from the last header to the end of the file)
    if (lastStart < lines.length) {
        chunks.push(lines.slice(lastStart).join('\n'))
    }

    return chunks
}
