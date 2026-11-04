import assert from 'node:assert/strict'
import { localSettings } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '18-rendering-off'

/**
 * Both opt-out switches off: math stays literal, code is not highlighted, and raw HTML in
 * the answer is shown as text instead of being parsed.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({
		chunks: ['<script>alert(1)</script>\n\nMath: $$E = mc^2$$\n\n```js\nconst answer = 42\n```\n'],
	})
	try {
		await ctx.open({
			settings: localSettings(server.endpoint, {
				rendering: { math: false, codeHighlighting: false },
			}),
		})
		const { page } = ctx

		await page.locator('.composer__input').fill('Show me everything')
		await page.locator('button[aria-label="Submit"]').click()
		await page.waitForSelector('.message--assistant .message__footer')

		const markdown = page.locator('.message--assistant .markdown').first()
		const text = await markdown.innerText()

		assert.equal(await markdown.locator('script').count(), 0, 'raw HTML is never parsed')
		assert.match(text, /<script>alert\(1\)<\/script>/, 'raw HTML is shown as text')
		assert.match(text, /\$\$E = mc\^2\$\$/, 'math is left alone when the plugin is off')
		assert.equal(await markdown.locator('.katex').count(), 0)

		// The fence still renders as a code block, just without Shiki's token colours.
		await page.waitForSelector('.message--assistant [data-streamdown="code-block"]')
		assert.match(text, /const answer = 42/)
		const tokenColors = await markdown
			.locator('[data-streamdown="code-block-body"] span')
			.evaluateAll((nodes) => nodes.map((node) => node.style.getPropertyValue('--sdm-c')))
		assert.ok(
			tokenColors.every((color) => color === '' || color === 'inherit'),
			`unhighlighted code must not carry token colours, got ${tokenColors.join(', ')}`,
		)
	} finally {
		await server.close()
	}
}
