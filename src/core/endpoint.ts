/**
 * Transport security of a provider's base URL.
 *
 * A prompt can carry a whole page the user attached, so everything that leaves the browser
 * for a model server is private by default. Over plain HTTP every router, access point and
 * middlebox on the way can read it, so a remote address is worth a warning; a loopback
 * address is the one exemption, because that traffic never crosses a network and warning
 * about it would put a badge on the ordinary local setup.
 *
 * Nothing here touches the network, and the copy lives here rather than in the two
 * components that render it, so the provider editor and the model picker cannot drift.
 */

/** Addresses whose traffic never leaves the machine. */
const LOOPBACK = /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|::1|::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/

/** `localhost`, any `*.localhost`, and the IPv4/IPv6 loopback ranges. */
export function isLoopbackHost(hostname: string): boolean {
	const host = hostname
		.trim()
		.toLowerCase()
		// A URL keeps an IPv6 literal in brackets, a caller may pass it without them.
		.replace(/^\[|\]$/g, '')
	return host === 'localhost' || host.endsWith('.localhost') || LOOPBACK.test(host)
}

export interface InsecureEndpoint {
	/** Heading of the warning. */
	title: string
	/** The sentence the provider editor shows under Base URL, where there is room to explain. */
	detail: string
	/** The one line the model picker's group heading carries, where a tooltip has no room. */
	summary: string
}

const TITLE = 'Unencrypted connection'

/**
 * The warning for a base URL reached over plain HTTP, or null when there is nothing to say.
 *
 * A URL that does not parse is left alone: a half-typed address is not a decision yet, and
 * the editor already refuses to save one.
 */
export function insecureEndpoint(baseURL: string | undefined): InsecureEndpoint | null {
	const raw = baseURL?.trim()
	if (!raw) return null

	let url: URL
	try {
		url = new URL(raw)
	} catch {
		return null
	}

	if (url.protocol !== 'http:' || isLoopbackHost(url.hostname)) return null

	return {
		title: TITLE,
		// The host is deliberately left out: the address is already on screen, next to the
		// mark in the picker and in the field above this sentence in the editor, so repeating
		// it only makes the warning longer to read.
		detail:
			'Requests travel over plain HTTP, so every device between this browser and the server can read them. ' +
			'A prompt can carry a whole page, so use an https address, or connect only over a VPN or a network you trust.',
		summary: 'Unencrypted traffic exposes your prompt and attached pages. Only use over VPN or trusted networks.',
	}
}
