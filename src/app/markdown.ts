import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'

function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const md = new MarkdownIt({
	html: false,
	linkify: true,
	breaks: false,
	typographer: false,
	highlight(code: string, language: string): string {
		if (language && hljs.getLanguage(language)) {
			try {
				const highlighted = hljs.highlight(code, { language, ignoreIllegals: true }).value
				return `<pre class="hljs"><code class="language-${escapeHtml(language)}">${highlighted}</code></pre>`
			} catch {
				// Fall through to escaped code.
			}
		}
		return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`
	},
})

md.renderer.rules.link_open = (tokens, index, options, _env, self) => {
	tokens[index]?.attrSet('target', '_blank')
	tokens[index]?.attrSet('rel', 'noopener noreferrer')
	return self.renderToken(tokens, index, options)
}

/** While streaming, a fence may not be closed yet; close it so the layout stays stable. */
function closeOpenFence(text: string): string {
	const fences = text.match(/^```/gm)?.length ?? 0
	return fences % 2 === 1 ? `${text}\n\`\`\`` : text
}

export function renderMarkdown(text: string, streaming = false): string {
	if (!text) return ''
	return md.render(streaming ? closeOpenFence(text) : text)
}
