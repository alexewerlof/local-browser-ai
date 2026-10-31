import type { ProviderSettings } from '../core/types'
import { hasHostAccess, hostOf } from '../platform/permissions'
import { DEFAULT_BASE_URLS, normalizeBaseURL } from './registry'
import { AppError, toAppError } from './errors'

interface ModelListResponse {
	data?: Array<{ id?: string; name?: string }>
	models?: Array<{ id?: string; name?: string }>
}

/**
 * Fetch the model list of a provider.
 *
 * Every supported provider exposes a `/models` endpoint: OpenAI, DeepSeek and
 * OpenAI-compatible servers use the OpenAI shape, Anthropic returns `{ data: [{ id }] }`.
 */
export async function discoverModels(provider: ProviderSettings): Promise<string[]> {
	if (provider.kind === 'prompt-api') return provider.models

	const baseURL = normalizeBaseURL(provider.baseURL, DEFAULT_BASE_URLS[provider.kind] ?? '')
	if (!(await hasHostAccess(baseURL))) {
		throw new AppError(
			'permission',
			`The extension does not have permission for ${hostOf(baseURL)}. Save the provider to grant it.`,
		)
	}

	const headers: Record<string, string> = { Accept: 'application/json', ...(provider.headers ?? {}) }
	if (provider.kind === 'anthropic') {
		if (provider.apiKey) headers['x-api-key'] = provider.apiKey
		headers['anthropic-version'] = '2023-06-01'
		headers['anthropic-dangerous-direct-browser-access'] = 'true'
	} else if (provider.apiKey) {
		headers.Authorization = `Bearer ${provider.apiKey}`
	}

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
	const ids = entries
		.map((entry) => entry.id ?? entry.name ?? '')
		.filter((id): id is string => Boolean(id))
		// Chat model lists often include embedding, speech and image models.
		.filter((id) => !/embedding|whisper|tts|dall-e|moderation|gpt-image|transcribe|rerank/i.test(id))
		.sort((a, b) => a.localeCompare(b))
	return ids
}
