import type { ModelDetails, ModelModality, ProviderSettings } from '../core/types'
import { hasHostAccess, hostOf } from '../platform/permissions'
import { DEFAULT_BASE_URL, normalizeBaseURL } from './registry'
import { AppError, toAppError } from './errors'

/**
 * One entry of a `/models` response. The shape is deliberately loose: OpenAI-compatible
 * servers all return `{ data: [{ id }] }`, but llama.cpp adds architecture, context and
 * load state, and other servers add their own spellings.
 */
export interface RawModelEntry {
	id?: string
	name?: string
	display_name?: string
	context_length?: number
	context_window?: number
	max_output_tokens?: number
	max_tokens?: number
	architecture?: {
		input_modalities?: string[]
		output_modalities?: string[]
	}
	meta?: {
		n_ctx?: number
		n_ctx_train?: number
	}
	status?: {
		value?: string
		args?: string[]
		preset?: string
	}
}

interface ModelListResponse {
	data?: RawModelEntry[]
	models?: RawModelEntry[]
}

const MODALITIES: readonly ModelModality[] = ['text', 'image', 'audio', 'video']

function positive(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined
}

function normalizeModalities(value: unknown): ModelModality[] {
	if (!Array.isArray(value)) return []
	const found = value.filter(
		(modality): modality is ModelModality =>
			typeof modality === 'string' && (MODALITIES as readonly string[]).includes(modality),
	)
	return [...new Set(found)]
}

/** Read `--flag value` and `--flag=value` alike; llama.cpp uses the first form. */
function numberArg(args: string[] | undefined, flag: string): number | undefined {
	if (!args) return undefined
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index]
		if (!arg) continue
		if (arg === flag) return positive(Number(args[index + 1]))
		if (arg.startsWith(`${flag}=`)) return positive(Number(arg.slice(flag.length + 1)))
	}
	return undefined
}

/**
 * Turn one server entry into the facts the Models table shows. Every field is what the
 * server said, spread across the spellings real servers use; a field it omits stays empty.
 */
export function parseModelEntry(entry: RawModelEntry): ModelDetails | null {
	const id = (entry.id ?? entry.name ?? '').trim()
	if (!id) return null

	const args = entry.status?.args
	const input = normalizeModalities(entry.architecture?.input_modalities)
	const output = normalizeModalities(entry.architecture?.output_modalities)
	const state = entry.status?.value

	return {
		id,
		label: entry.display_name ?? (entry.name && entry.name !== id ? entry.name : undefined),
		// `meta.n_ctx` is the context the server actually loaded; `--ctx-size` is what it
		// would load; `context_length` is usually the model's trained maximum.
		contextWindow:
			positive(entry.meta?.n_ctx) ??
			numberArg(args, '--ctx-size') ??
			positive(entry.context_window) ??
			positive(entry.context_length),
		maxOutputTokens:
			positive(entry.max_output_tokens) ?? positive(entry.max_tokens) ?? numberArg(args, '--n-predict'),
		inputModalities: input.length > 0 ? input : undefined,
		outputModalities: output.length > 0 ? output : undefined,
		state: state === 'loaded' || state === 'unloaded' ? state : undefined,
	}
}

/**
 * Fetch the model list of a provider with the attributes the table shows.
 *
 * A local server serves the OpenAI shape at `/models`.
 */
export async function discoverModels(provider: ProviderSettings): Promise<ModelDetails[]> {
	const baseURL = normalizeBaseURL(provider.baseURL, DEFAULT_BASE_URL)
	if (!(await hasHostAccess(baseURL))) {
		throw new AppError(
			'permission',
			`The extension does not have permission for ${hostOf(baseURL)}. Save the provider to grant it.`,
		)
	}

	const headers: Record<string, string> = { Accept: 'application/json', ...(provider.headers ?? {}) }
	if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`

	let response: Response
	try {
		response = await fetch(`${baseURL}/models`, { headers })
	} catch (error) {
		throw toAppError(error)
	}

	if (!response.ok) {
		throw new AppError(
			response.status === 401 || response.status === 403 ? 'auth' : 'network',
			`Could not list models (HTTP ${response.status}).`,
			{ status: response.status },
		)
	}

	const body = (await response.json()) as ModelListResponse
	const entries = body.data ?? body.models ?? []
	const seen = new Set<string>()
	const models: ModelDetails[] = []
	for (const entry of entries) {
		const model = parseModelEntry(entry)
		if (!model || seen.has(model.id)) continue
		seen.add(model.id)
		models.push(model)
	}
	return models.sort((a, b) => a.id.localeCompare(b.id))
}
