import { localSettings } from '../fixtures.mjs'

export const name = '99-preview'

export async function run(ctx) {
	await ctx.openSettings(
		{
			settings: localSettings('http://127.0.0.1:1/v1', {
				tools: {
					enabled: [],
					autoApprove: [],
					mcp: [
						{
							id: 'mcp_deepseek',
							label: 'Deepseek',
							url: 'http://127.0.0.1:9000/mcp',
							headers: { Authorization: 'Bearer 3e7f0c1a2b7' },
							enabled: true,
							autoApprove: false,
							disabledTools: [],
							stripOrigin: true,
						},
					],
				},
			}),
		},
		'#/mcp',
	)
	const { page } = ctx
	await page.setViewportSize({ width: 900, height: 1100 })
	await page.waitForSelector('.mcp-server')
	await ctx.shot('list')
	await page.locator('.mcp-server').first().locator('button:has-text("Edit")').click()
	await page.waitForSelector('.mcp-editor')
	await ctx.shot('editor')
	const boxes = await page.evaluate(() =>
		[...document.querySelectorAll('.mcp-editor .field, .mcp-editor .field__text, .mcp-editor .field__hint')].map(
			(element) => {
				const rect = element.getBoundingClientRect()
				return [element.className, Math.round(rect.width), Math.round(rect.height)]
			},
		),
	)
	console.log('BOXES', JSON.stringify(boxes))
	await page.locator('.mcp-editor button:has-text("Add header")').click()
	await page.locator('.mcp-editor input[aria-label="Header 2 name"]').fill('Bad Name')
	await page.locator('.mcp-editor button:has-text("Save server")').click()
	await page.waitForSelector('.mcp-header__error')
	const invalidStyle = await page.evaluate(() => {
		const input = document.querySelector('.mcp-header input[aria-invalid]')
		if (!input) return 'missing'
		const matches = input.matches(".mcp-header > .input[aria-invalid='true']")
		const rules = []
		for (const sheet of document.styleSheets) {
			for (const rule of sheet.cssRules) {
				if (rule.selectorText?.includes('mcp-header')) rules.push(rule.cssText.slice(0, 120))
			}
		}
		return {
			border: getComputedStyle(input).borderColor,
			matches,
			hover: input.matches(':hover'),
			focus: input.matches(':focus'),
			strong: getComputedStyle(document.documentElement).getPropertyValue('--border-strong'),
			danger: getComputedStyle(document.documentElement).getPropertyValue('--danger-fg'),
			sheets: [...document.styleSheets].map((sheet) => sheet.href?.split('/').pop()),
		}
	})
	console.log('INVALID', JSON.stringify(invalidStyle))
	await ctx.shot('error')
}
