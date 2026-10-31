import { useEffect, useMemo, useRef } from 'react'
import { renderMarkdown } from '../markdown'

/** Render assistant markdown, with a copy button on every code block. */
export function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
	const html = useMemo(() => renderMarkdown(text, streaming), [text, streaming])
	const containerRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const container = containerRef.current
		if (!container) return
		for (const pre of container.querySelectorAll('pre')) {
			if (pre.querySelector('.code-copy')) continue
			const button = document.createElement('button')
			button.type = 'button'
			button.className = 'code-copy'
			button.textContent = 'Copy'
			pre.appendChild(button)
		}
	}, [html])

	const handleClick = async (event: React.MouseEvent<HTMLDivElement>) => {
		const target = event.target as HTMLElement
		const button = target.closest<HTMLButtonElement>('.code-copy')
		if (!button) return
		const code = button.closest('pre')?.querySelector('code')?.textContent ?? ''
		try {
			await navigator.clipboard.writeText(code)
			button.textContent = 'Copied'
			setTimeout(() => {
				button.textContent = 'Copy'
			}, 1200)
		} catch {
			button.textContent = 'Failed'
		}
	}

	return (
		<div
			ref={containerRef}
			className="markdown"
			onClick={handleClick}
			// markdown-it runs with `html: false`, so raw HTML in model output is escaped.
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	)
}
