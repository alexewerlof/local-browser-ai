import type { PromptApiStatus } from './types'

/**
 * Prompt API availability, download and context-window probing.
 *
 * `@browser-ai/core` owns the session lifecycle; we only read the small status surface
 * it exposes and warm the model (from the options page or the onboarding step) so the
 * first prompt does not trigger a download.
 */
export async function getPromptApiStatus(): Promise<PromptApiStatus> {
	if (typeof navigator === 'undefined' || !/Chrome|Edg/.test(navigator.userAgent)) {
		return { availability: 'unsupported', message: 'The built-in model needs Chrome or Edge.' }
	}
	let browserAI: typeof import('@browser-ai/core')
	try {
		browserAI = await import('@browser-ai/core')
	} catch {
		return { availability: 'unsupported', message: 'The built-in model library failed to load.' }
	}
	if (!browserAI.doesBrowserSupportBrowserAI()) {
		return {
			availability: 'unsupported',
			message: 'This browser does not expose the Prompt API. Use an API provider instead.',
		}
	}

	const model = browserAI.browserAI.chat('text')
	try {
		const raw = await model.availability()
		const availability =
			raw === 'available-after-download' || raw === 'downloadable'
				? 'downloadable'
				: raw === 'downloading'
					? 'downloading'
					: raw === 'available'
						? 'available'
						: 'unavailable'
		return {
			availability,
			contextWindow: availability === 'available' ? model.getContextWindow() : undefined,
		}
	} catch (error) {
		return {
			availability: 'unavailable',
			message: error instanceof Error ? error.message : String(error),
		}
	}
}

/** Start (or resume) the model download and report progress in the range 0..1. */
export async function warmUpPromptModel(onProgress?: (progress: number) => void): Promise<PromptApiStatus> {
	const browserAI = await import('@browser-ai/core')
	const model = browserAI.browserAI.chat('text')
	const warm = await model.createSessionWithProgress(onProgress)
	return {
		availability: 'available',
		contextWindow: warm.getContextWindow(),
		inputUsage: warm.getContextUsage(),
	}
}
