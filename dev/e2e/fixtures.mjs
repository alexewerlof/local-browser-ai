/** Settings fixtures shared by the browser scenarios. */

export const ALL_TOOLS = [
	'read_attached_page',
	'get_page_outline',
	'read_page_section',
	'find_in_page',
	'get_selection',
	'get_current_datetime',
	'search_web',
	'open_url',
	'remember',
	'recall',
]

/** Tools that never ask before running; `open_url` and memory updates do. */
export const AUTO_APPROVED_TOOLS = ALL_TOOLS.filter((id) => id !== 'open_url' && id !== 'remember')

export function localSettings(endpoint, overrides = {}) {
	const model = overrides.model ?? 'fake-model'
	return {
		version: 7,
		providers: [
			{
				id: 'local',
				kind: 'openai-compatible',
				label: 'Fake local server',
				baseURL: endpoint,
				apiKey: '',
				models: [model],
				contextWindowOverride: 32_000,
			},
		],
		defaultModel: { providerId: 'local', modelId: model },
		modelDefaults: { temperature: 0.7, thinking: { level: 'off' } },
		context: {
			compactionThreshold: 0.75,
			keepRecentTurns: 4,
			outputReserveRatio: 0.2,
			maxToolSteps: 4,
			pageContext: 'always',
			strategy: 'tiered',
			pageShare: 0.35,
		},
		tools: { enabled: ALL_TOOLS, autoApprove: AUTO_APPROVED_TOOLS, mcp: [] },
		skills: [],
		memory: { enabled: true, injectShare: 0.15, autoLimit: 3 },
		rendering: { math: true, codeHighlighting: false },
		ui: { theme: 'light', submitKey: 'enter' },
		systemPrompt: 'You are a test assistant. Answer from the attached page.',
		...overrides,
	}
}

export function promptApiOnlySettings() {
	return {
		version: 7,
		providers: [{ id: 'prompt-api', kind: 'prompt-api', label: 'Built-in browser model', models: ['text'] }],
		defaultModel: { providerId: 'prompt-api', modelId: 'text' },
		modelDefaults: { temperature: 0.7, thinking: { level: 'off' } },
		context: {
			compactionThreshold: 0.75,
			keepRecentTurns: 4,
			outputReserveRatio: 0.2,
			maxToolSteps: 4,
			pageContext: 'auto',
			strategy: 'tiered',
			pageShare: 0.35,
		},
		tools: { enabled: [], autoApprove: [], mcp: [] },
		skills: [],
		memory: { enabled: true, injectShare: 0.15, autoLimit: 3 },
		rendering: { math: true, codeHighlighting: false },
		ui: { theme: 'light', submitKey: 'enter' },
		systemPrompt: 'You are a test assistant.',
	}
}

export const exampleTab = {
	id: 42,
	url: 'https://example.com/pricing',
	title: 'Example Pricing',
}
