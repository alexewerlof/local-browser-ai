import { z } from 'zod'
import type { AppSettings, ProviderSettings, Skill, ToolSettings } from './types'
import { isHttpUrl } from './mcp'

export const PROMPT_API_PROVIDER_ID = 'prompt-api'
/** The Prompt API exposes a single model; `@browser-ai/core` names it "text". */
export const PROMPT_API_MODEL_ID = 'text'

/** Version of the settings document this build writes. Bump it with a migration step. */
export const SETTINGS_VERSION = 4

const modelRefSchema = z.object({
	providerId: z.string(),
	modelId: z.string(),
})

const thinkingSchema = z.object({
	level: z.enum(['off', 'auto', 'low', 'medium', 'high', 'custom']),
	tokens: z.number().int().positive().optional(),
})

const providerSchema = z.object({
	id: z.string().min(1),
	kind: z.enum(['prompt-api', 'openai', 'anthropic', 'deepseek', 'openai-compatible']),
	label: z.string().min(1),
	baseURL: z.string().optional(),
	apiKey: z.string().optional(),
	headers: z.record(z.string(), z.string()).optional(),
	models: z.array(z.string()),
	contextWindowOverride: z.number().int().positive().optional(),
	maxOutputTokensOverride: z.number().int().positive().optional(),
})

const skillSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string().optional(),
	prompt: z.string(),
	builtIn: z.boolean().optional(),
})

/**
 * Defaults are permissive on purpose: a server stored by an older build is filled in
 * rather than rejected, so a partial record cannot reset the whole settings document.
 */
const mcpServerSchema = z.object({
	id: z.string().min(1),
	label: z.string().trim().min(1).max(80),
	url: z.string().trim().max(2048).refine(isHttpUrl, 'Enter an http:// or https:// URL.'),
	headers: z.record(z.string(), z.string()).default({}),
	enabled: z.boolean().default(false),
	autoApprove: z.boolean().default(false),
	disabledTools: z.array(z.string()).default([]),
	stripOrigin: z.boolean().default(false),
})

export const settingsSchema = z.object({
	version: z.literal(SETTINGS_VERSION),
	providers: z.array(providerSchema),
	defaultModel: modelRefSchema.nullable(),
	modelDefaults: z.object({
		temperature: z.number().min(0).max(2),
		maxOutputTokens: z.number().int().positive().optional(),
		thinking: thinkingSchema,
	}),
	context: z.object({
		compactionThreshold: z.number().min(0.5).max(0.95),
		keepRecentTurns: z.number().int().min(1).max(20),
		outputReserveRatio: z.number().min(0.05).max(0.5),
		maxToolSteps: z.number().int().min(1).max(20),
		pageContext: z.enum(['auto', 'always', 'never']),
		strategy: z.enum(['index', 'tiered', 'full', 'outline']),
		pageShare: z.number().min(0.1).max(0.9),
	}),
	tools: z.object({
		enabled: z.array(z.string()),
		autoApprove: z.array(z.string()),
		mcp: z.array(mcpServerSchema).default([]),
	}),
	skills: z.array(skillSchema),
	ui: z.object({
		theme: z.enum(['system', 'light', 'dark']),
		sendKey: z.enum(['enter', 'mod+enter']),
	}),
	systemPrompt: z.string(),
})

export const READ_ONLY_TOOL_IDS = [
	'read_attached_page',
	'get_page_outline',
	'read_page_section',
	'find_in_page',
	'get_selection',
	'get_current_datetime',
	'search_web',
] as const

export const ACTION_TOOL_IDS = ['open_url'] as const

export const builtInSkills: Skill[] = [
	{
		id: 'summarize-page',
		name: 'Summarize page',
		description: 'A structured summary of the attached page',
		prompt: 'Summarize the attached page. Lead with a one-sentence description, then give key points as a short list. Keep it under 200 words.',
		builtIn: true,
	},
	{
		id: 'key-points',
		name: 'Key points',
		description: 'Extract the takeaways and supporting evidence',
		prompt: 'List the key takeaways from the attached page. For each one, cite the section heading it comes from and say why it matters.',
		builtIn: true,
	},
	{
		id: 'explain-selection',
		name: 'Explain selection',
		description: 'Explain the selected text in plain language',
		prompt: 'Explain the following selection in plain language, then say what its practical consequences are:\n\n',
		builtIn: true,
	},
	{
		id: 'critique',
		name: 'Critique argument',
		description: 'Find weak claims, missing evidence and counter-arguments',
		prompt: 'Critique the argument in the attached page. Separate claims that are well supported from claims that are not, and name the strongest counter-argument.',
		builtIn: true,
	},
	{
		id: 'find-in-page',
		name: 'Find in page',
		description: 'Locate a specific detail on the page',
		prompt: 'Search the attached page for: ',
		builtIn: true,
	},
	{
		id: 'compare',
		name: 'Compare with my notes',
		description: 'Contrast the page with what I tell you',
		prompt: 'Compare the attached page with the following, and call out agreements, contradictions and gaps:\n\n',
		builtIn: true,
	},
]

export const defaultProvider = (): ProviderSettings => ({
	id: PROMPT_API_PROVIDER_ID,
	kind: 'prompt-api',
	label: 'Built-in browser model',
	models: [PROMPT_API_MODEL_ID],
})

export const defaultSystemPrompt = [
	'You are Local Browser AI, a chat assistant that runs in the browser sidebar.',
	'The user is looking at a web page and may attach it to the conversation.',
	'Only an index of an attached page is usually in the prompt: its title, URL, outline and size. Read the sections you need with the page tools before answering from details.',
	'When a page is attached, answer from that page first. Quote or reference the section you used.',
	'If the page does not contain the answer, say so plainly instead of guessing.',
	"When the answer depends on today's date, the weekday or the time of day, call `get_current_datetime` instead of guessing.",
	'You can use tools to read the attached page, search it, search the web, check the current date and time, and open links in a new tab.',
	'`search_web` opens its results in a tab you cannot read. Say what you searched for and ask the user to attach that tab before answering from it.',
	'Use markdown: short paragraphs, lists, tables and fenced code blocks where they help.',
	'Be direct and concise. Do not pad answers with pleasantries.',
].join('\n')

export const defaultSettings = (): AppSettings => ({
	version: SETTINGS_VERSION,
	providers: [defaultProvider()],
	defaultModel: { providerId: PROMPT_API_PROVIDER_ID, modelId: PROMPT_API_MODEL_ID },
	modelDefaults: {
		temperature: 0.7,
		thinking: { level: 'auto' },
	},
	context: {
		compactionThreshold: 0.75,
		keepRecentTurns: 4,
		outputReserveRatio: 0.2,
		maxToolSteps: 4,
		pageContext: 'auto',
		strategy: 'index',
		pageShare: 0.35,
	},
	tools: {
		enabled: [...READ_ONLY_TOOL_IDS, ...ACTION_TOOL_IDS],
		autoApprove: [...READ_ONLY_TOOL_IDS],
		mcp: [],
	},
	skills: builtInSkills,
	ui: {
		theme: 'system',
		sendKey: 'enter',
	},
	systemPrompt: defaultSystemPrompt,
})

/**
 * Tool ids introduced after the settings version in which they first shipped. A store
 * written by an older version has no opinion about them, so the migration enables them;
 * a toggle the user flips afterwards is preserved because the store then carries the
 * current version.
 */
const TOOLS_ADDED_IN = [
	{ version: 2, ids: ['get_current_datetime'] },
	{ version: 3, ids: ['search_web'] },
] as const

/** Upgrade a stored settings document in place. Unknown shapes are left for the schema. */
function migrateSettings(input: unknown): unknown {
	if (!input || typeof input !== 'object') return input

	const stored = input as Record<string, unknown>
	const version = typeof stored.version === 'number' ? stored.version : 1
	if (version >= SETTINGS_VERSION) return stored

	const tools = stored.tools
	if (!tools || typeof tools !== 'object') {
		// Without a tools object the defaults fill in below, including the new ids.
		return { ...stored, version: SETTINGS_VERSION }
	}

	const record = tools as { enabled?: unknown; autoApprove?: unknown }
	const ids = (value: unknown) =>
		Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []

	const enabled = ids(record.enabled)
	const autoApprove = ids(record.autoApprove)
	for (const entry of TOOLS_ADDED_IN) {
		if (version >= entry.version) continue
		for (const id of entry.ids) {
			if (!enabled.includes(id)) enabled.push(id)
			if (!autoApprove.includes(id)) autoApprove.push(id)
		}
	}

	return { ...stored, version: SETTINGS_VERSION, tools: { ...record, enabled, autoApprove } }
}

/**
 * Keep the tool arrays and only the MCP entries that parse. One corrupt server would
 * otherwise fail the whole document and reset the user's providers and API keys.
 */
function sanitizeTools(value: unknown, fallback: ToolSettings): ToolSettings {
	if (!value || typeof value !== 'object') return fallback

	const record = value as { enabled?: unknown; autoApprove?: unknown; mcp?: unknown }
	const ids = (input: unknown) =>
		Array.isArray(input) ? input.filter((id): id is string => typeof id === 'string') : undefined

	const servers: ToolSettings['mcp'] = []
	const seen = new Set<string>()
	if (Array.isArray(record.mcp)) {
		for (const entry of record.mcp) {
			const parsed = mcpServerSchema.safeParse(entry)
			if (!parsed.success || seen.has(parsed.data.id)) continue
			seen.add(parsed.data.id)
			servers.push(parsed.data)
		}
	}

	return {
		enabled: ids(record.enabled) ?? fallback.enabled,
		autoApprove: ids(record.autoApprove) ?? fallback.autoApprove,
		mcp: servers,
	}
}

/**
 * Turn whatever was stored into a valid settings object.
 *
 * Built-in skills are always present (user copies are kept alongside them), and the
 * default provider/model is re-added when missing so a corrupted store cannot brick the panel.
 */
export function normalizeSettings(input: unknown): AppSettings {
	const defaults = defaultSettings()

	// Fill fields added after a store was written so older settings keep parsing.
	const stored = migrateSettings(input)
	const candidate =
		stored && typeof stored === 'object'
			? {
					...defaults,
					...(stored as Record<string, unknown>),
					context: {
						...defaults.context,
						...((stored as { context?: Record<string, unknown> }).context ?? {}),
					},
					tools: sanitizeTools((stored as { tools?: unknown }).tools, defaults.tools),
					systemPrompt:
						typeof (stored as { systemPrompt?: unknown }).systemPrompt === 'string'
							? (stored as { systemPrompt: string }).systemPrompt
							: defaults.systemPrompt,
				}
			: stored

	const parsed = settingsSchema.safeParse(candidate)
	if (!parsed.success) return defaults

	const settings = parsed.data as AppSettings

	const providerIds = new Set(settings.providers.map((provider) => provider.id))
	if (!providerIds.has(PROMPT_API_PROVIDER_ID)) {
		settings.providers.unshift(defaultProvider())
	}

	const skillIds = new Set(settings.skills.map((skill) => skill.id))
	for (const skill of builtInSkills) {
		if (!skillIds.has(skill.id)) settings.skills.push(skill)
	}

	if (
		settings.defaultModel &&
		!settings.providers.some((provider) => provider.id === settings.defaultModel?.providerId)
	) {
		settings.defaultModel = defaults.defaultModel
	}

	// Drop tool ids that no longer exist.
	const knownTools = new Set<string>([...READ_ONLY_TOOL_IDS, ...ACTION_TOOL_IDS])
	settings.tools.enabled = settings.tools.enabled.filter((id) => knownTools.has(id))
	settings.tools.autoApprove = settings.tools.autoApprove.filter((id) => knownTools.has(id))

	return settings
}

/** True when at least one tool could be offered to the model. */
export function hasEnabledTools(settings: AppSettings): boolean {
	return settings.tools.enabled.length > 0 || settings.tools.mcp.some((server) => server.enabled)
}

export function getProvider(settings: AppSettings, providerId: string): ProviderSettings | undefined {
	return settings.providers.find((provider) => provider.id === providerId)
}

export function describeModel(settings: AppSettings, ref: { providerId: string; modelId: string }): string {
	const provider = getProvider(settings, ref.providerId)
	if (!provider) return ref.modelId
	if (provider.kind === 'prompt-api') return 'Built-in model'
	return ref.modelId || provider.label
}
