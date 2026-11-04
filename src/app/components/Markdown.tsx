import { Streamdown, defaultRehypePlugins } from 'streamdown'
import type { StreamdownProps } from 'streamdown'
import { useMarkdownPlugins } from './useMarkdownPlugins'

/**
 * Raw HTML in model output stays inert text. `rehype-raw` is left out on purpose, which
 * keeps the guarantee the previous markdown-it renderer had (`html: false`); Streamdown
 * turns leftover raw nodes into text. Passing `rehypePlugins` replaces its default list,
 * so sanitising and URL hardening have to be re-added by hand.
 */
const rehypePlugins: StreamdownProps['rehypePlugins'] = [
	defaultRehypePlugins.sanitize,
	defaultRehypePlugins.harden,
].filter((plugin) => plugin !== undefined)

/**
 * Only the copy button survives from the built-in controls: downloading a snippet or a
 * table from the side panel is noise, and the fullscreen overlays do not fit in it.
 */
const controls: StreamdownProps['controls'] = {
	code: { copy: true, download: false },
	table: false,
	image: false,
}

/** The panel has no room for a confirmation modal; links open in a new tab as before. */
const linkSafety: StreamdownProps['linkSafety'] = { enabled: false }

/**
 * Render assistant markdown.
 *
 * `math` and `codeHighlighting` gate the two heavy plugins, which are loaded on demand
 * (see `useMarkdownPlugins`). Streaming, unterminated blocks and the copy buttons are
 * Streamdown's job.
 */
export function Markdown({
	text,
	streaming = false,
	math = true,
	codeHighlighting = false,
}: {
	text: string
	streaming?: boolean
	math?: boolean
	codeHighlighting?: boolean
}) {
	const plugins = useMarkdownPlugins({ math, codeHighlighting })

	return (
		<Streamdown
			className="markdown"
			controls={controls}
			isAnimating={streaming}
			lineNumbers={false}
			linkSafety={linkSafety}
			plugins={plugins}
			rehypePlugins={rehypePlugins}
		>
			{text}
		</Streamdown>
	)
}
