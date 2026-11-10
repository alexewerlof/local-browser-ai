/** Settings fixtures and page-strip helpers shared by the browser scenarios. */

export const ALL_TOOLS = ['read_page', 'get_selection', 'get_current_datetime', 'search_web', 'remember', 'recall']

/** Tools that never ask before running; `read_page` with a URL and memory updates do. */
export const AUTO_APPROVED_TOOLS = ALL_TOOLS.filter((id) => id !== 'remember')

export function localSettings(endpoint, overrides = {}) {
	const model = overrides.model ?? 'fake-model'
	return {
		version: 12,
		providers: [
			{
				id: 'local',
				label: 'Fake local server',
				baseURL: endpoint,
				apiKey: '',
				models: [model],
				contextWindowOverride: 32_000,
			},
		],
		defaultModel: { providerId: 'local', modelId: model },
		context: {
			compactionThreshold: 0.75,
			keepRecentTurns: 4,
			outputReserveRatio: 0.2,
			maxToolSteps: 4,
		},
		tools: { enabled: ALL_TOOLS, autoApprove: AUTO_APPROVED_TOOLS, mcp: [] },
		promptTemplates: [],
		memory: { enabled: true, injectShare: 0.15, autoLimit: 3 },
		rendering: { math: true, codeHighlighting: false },
		ui: { theme: 'light', submitKey: 'enter', fontSize: 'medium' },
		systemPrompt: 'You are a test assistant. Answer from the added pages.',
		...overrides,
	}
}

export const exampleTab = {
	id: 42,
	url: 'https://example.com/pricing',
	title: 'Example Pricing',
}

/** A second tab, so a scenario can give one chat more than one page. */
export const deskTab = {
	id: 43,
	windowId: 1,
	url: 'https://garden.example/desk',
	title: 'Standing desk — Garden',
	favIconUrl: '',
}

/** What the worker extracts from `deskTab`. */
export const deskExtraction = {
	url: deskTab.url,
	baseUrl: deskTab.url,
	canonicalUrl: deskTab.url,
	title: deskTab.title,
	description: 'A desk',
	lang: 'en',
	faviconUrl: '',
	byline: '',
	publishedTime: '',
	selection: '',
	truncated: false,
	text: 'The desk costs 1299 EUR and ships in April.',
	aria: '',
	controls: 0,
	html: [
		'<html><body><article>',
		'<h1>Standing desk</h1>',
		'<p>The desk costs 1299 EUR and ships in April.</p>',
		'<h2>Warranty</h2>',
		'<p>Ten years on the frame, three on the motor.</p>',
		'</article></body></html>',
	].join(''),
}

/**
 * Wait until the page strip reports `count` pages. Two or more collapse into the count
 * badge, so the number of `.page-chip` nodes is not a readiness signal any more.
 */
export async function waitForPageCount(page, count) {
	await page.waitForFunction((expected) => {
		const badge = document.querySelector('.page-list__toggle')
		return badge?.textContent?.trim() === String(expected)
	}, count)
}

/** Open or close the chip row of a chat holding more than one page. */
export async function togglePageList(page) {
	await page.locator('.page-list__toggle').click()
}

/**
 * Show the steps of every answer.
 *
 * While a run streams its rows are on screen; when it ends they fold into one summary row,
 * so a scenario that inspects a finished answer has to open it first.
 */
export async function expandSteps(page) {
	// A run keeps its rows open and has no summary yet, so wait for the run to end before
	// counting them — otherwise a summary that appears mid-wait is never opened.
	await page.waitForFunction(() => document.querySelector('[aria-label="Stop generating"]') === null)
	const summaries = page.locator('.steps__summary')
	const count = await summaries.count()
	for (let index = 0; index < count; index += 1) {
		const summary = summaries.nth(index)
		if ((await summary.getAttribute('aria-expanded')) !== 'true') await summary.click()
	}
	// React commits the rows a tick after the click, so wait for the state rather than for
	// a node that a previous, already-open group may be providing.
	await page.waitForFunction(() => {
		const nodes = [...document.querySelectorAll('.steps__summary')]
		return nodes.every((node) => node.getAttribute('aria-expanded') === 'true')
	})
	await page.waitForSelector('.steps__list')
}
