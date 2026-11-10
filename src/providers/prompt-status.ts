import { createBrowserAIModel, promptAvailability } from './browser-ai'
import type { PromptApiStatus } from './types'

/**
 * Prompt API availability, download and context-window probing.
 *
 * `@browser-ai/core` owns the session lifecycle; we only read the small status surface
 * it exposes and warm the model (from the Settings page or the onboarding step) so the
 * first prompt does not trigger a download.
 */
export async function getPromptApiStatus(): Promise<PromptApiStatus> {
	if (typeof navigator === 'undefined' || !/Chrome|Edg/.test(navigator.userAgent)) {
		return { availability: 'unsupported', message: 'The built-in model needs Chrome or Edge.' }
	}
	let supported: boolean
	try {
		const { doesBrowserSupportBrowserAI } = await import('@browser-ai/core')
		supported = doesBrowserSupportBrowserAI()
	} catch {
		return { availability: 'unsupported', message: 'The built-in model library failed to load.' }
	}
	if (!supported) {
		return {
			availability: 'unsupported',
			message: 'This browser does not expose the Prompt API. Use a local server instead.',
		}
	}

	try {
		const model = await createBrowserAIModel()
		const availability = promptAvailability(await model.availability())
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
	const model = await createBrowserAIModel()
	const warm = await model.createSessionWithProgress(onProgress)
	return {
		availability: 'available',
		contextWindow: warm.getContextWindow(),
		inputUsage: warm.getContextUsage(),
	}
}

export interface PromptStatusSummary {
	/** One word for a badge. */
	label: string
	/** A sentence under it, saying what happens next. */
	hint: string
}

/**
 * The status as a person reads it. One place for these words, because the panel's banner,
 * the empty state and Settings → Providers all say the same thing about the same model.
 *
 * `null` is "not asked yet", not "broken": the probe is asynchronous, so a card that renders
 * before the answer must not claim the model is missing.
 */
export function describePromptStatus(status: PromptApiStatus | null): PromptStatusSummary {
	if (!status) {
		return { label: 'Checking', hint: 'Asking the browser whether the model is ready.' }
	}
	switch (status.availability) {
		case 'available':
			return {
				label: 'Ready',
				hint: 'The model runs on this device with no network. Its window is small, so pages are read on demand.',
			}
		case 'downloadable':
			return {
				label: 'Not downloaded',
				hint: 'Chrome downloads it once, then it runs entirely on this device.',
			}
		case 'downloading':
			return {
				label: 'Downloading',
				hint: 'The browser is fetching the model. It can take a while; Check again shows when it finishes.',
			}
		case 'unavailable':
			return { label: 'Unavailable', hint: status.message ?? 'This device cannot run the built-in model.' }
		case 'unsupported':
			return { label: 'Not supported', hint: status.message ?? 'This browser does not expose the Prompt API.' }
	}
}
