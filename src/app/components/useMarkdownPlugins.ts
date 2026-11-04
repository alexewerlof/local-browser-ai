import { useEffect, useMemo, useState } from 'react'
import type { PluginConfig } from 'streamdown'

/**
 * Math and syntax highlighting are the two expensive parts of rendering, so both live in
 * their own chunks and are only fetched when a setting asks for them. The loaded plugins
 * are kept in module scope: every message in a transcript shares one copy, and a
 * transcript re-render must not re-import anything.
 */
let mathPlugin: PluginConfig['math']
let codePlugin: PluginConfig['code']
let mathLoad: Promise<void> | undefined
let codeLoad: Promise<void> | undefined

const EMPTY_PLUGINS: PluginConfig = {}

function loadMath(): Promise<void> {
	mathLoad ??= Promise.all([
		import('@streamdown/math').then((module) => {
			mathPlugin = module.math
		}),
		// KaTeX's stylesheet brings its fonts with it, so it loads with the plugin.
		import('katex/dist/katex.min.css').then(() => undefined),
	])
		.then(() => undefined)
		// A failed chunk fetch must not poison the cache: forget it so a later attempt retries.
		.catch(() => {
			mathLoad = undefined
		})
	return mathLoad
}

function loadCode(): Promise<void> {
	codeLoad ??= import('@streamdown/code')
		.then((module) => {
			codePlugin = module.code
		})
		.catch(() => {
			codeLoad = undefined
		})
	return codeLoad
}

export interface MarkdownPluginOptions {
	math: boolean
	codeHighlighting: boolean
}

/**
 * Resolve the Streamdown plugin object for the current rendering settings.
 *
 * The returned object is reference-stable while the settings and the load state are, which
 * matters because Streamdown memoises on `plugins`.
 */
export function useMarkdownPlugins({ math, codeHighlighting }: MarkdownPluginOptions): PluginConfig {
	const [ready, setReady] = useState(() => ({ math: Boolean(mathPlugin), code: Boolean(codePlugin) }))

	useEffect(() => {
		const pending: Promise<void>[] = []
		if (math) pending.push(loadMath())
		if (codeHighlighting) pending.push(loadCode())
		if (pending.length === 0) return

		let cancelled = false
		void Promise.all(pending).then(() => {
			if (!cancelled) setReady({ math: Boolean(mathPlugin), code: Boolean(codePlugin) })
		})
		return () => {
			cancelled = true
		}
	}, [math, codeHighlighting])

	return useMemo(() => {
		const useMath = math && ready.math && mathPlugin
		const useCode = codeHighlighting && ready.code && codePlugin
		if (!useMath && !useCode) return EMPTY_PLUGINS

		const plugins: PluginConfig = {}
		if (useMath) plugins.math = mathPlugin
		if (useCode) plugins.code = codePlugin
		return plugins
	}, [math, codeHighlighting, ready.math, ready.code])
}
