/**
 * Network rules for MCP endpoints.
 *
 * A browser always attaches `Origin: chrome-extension://<id>` to a cross-origin POST, and
 * that is a forbidden header: no script can remove it. MCP servers commonly reject any
 * origin they do not know, as DNS-rebinding protection, so a user whose server does that
 * sees a 403 that no amount of header editing can fix.
 *
 * `declarativeNetRequest` is the one MV3 mechanism that can drop a request header. Rules
 * are session-scoped, so nothing survives a browser restart and a stale rule can never
 * outlive the setting that created it.
 */

import type { McpServerSettings } from '../core/types'
import { getChrome } from './chrome'

interface HeaderRule {
	id: number
	priority: number
	action: { type: 'modifyHeaders'; requestHeaders: Array<{ header: string; operation: 'remove' }> }
	condition: { urlFilter: string; resourceTypes: chrome.declarativeNetRequest.ResourceType[] }
}

/** Ids added by the last sync, so rules for removed or edited servers are cleaned up. */
let appliedIds: number[] = []

/** The URL prefix a rule matches: the endpoint's origin, anchored at the start. */
export function ruleFilterFor(url: string): string | null {
	try {
		const parsed = new URL(url.trim())
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
		return `|${parsed.origin}/`
	} catch {
		return null
	}
}

function ruleIdFor(server: McpServerSettings, used: Set<number>): number {
	let hash = 5381
	for (let index = 0; index < server.id.length; index += 1) {
		hash = ((hash << 5) + hash + server.id.charCodeAt(index)) >>> 0
	}
	// DNR rule ids must be >= 1 and fit in a 32-bit int.
	let id = (hash % 2_000_000_000) + 1
	while (used.has(id)) id = id === 2_000_000_000 ? 1 : id + 1
	used.add(id)
	return id
}

/** Build the rules for the servers that asked to send requests without an Origin. */
export function originRulesFor(servers: McpServerSettings[]): HeaderRule[] {
	const used = new Set<number>()
	const rules: HeaderRule[] = []

	for (const server of servers) {
		if (!server.stripOrigin) continue
		const urlFilter = ruleFilterFor(server.url)
		if (!urlFilter) continue
		rules.push({
			id: ruleIdFor(server, used),
			priority: 1,
			action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'remove' }] },
			// Only XMLHttpRequests (the MCP client's fetch) are touched.
			condition: { urlFilter, resourceTypes: ['xmlhttprequest'] },
		})
	}

	return rules
}

/**
 * Replace the extension's session rules with the set the settings call for.
 *
 * Returns false when the platform cannot apply rules (a plain web page, or a browser
 * without the permission), so the UI can stop promising that the header is gone.
 */
export async function syncOriginStripping(servers: McpServerSettings[]): Promise<boolean> {
	const api = getChrome()?.declarativeNetRequest
	if (!api?.updateSessionRules) return false

	const rules = originRulesFor(servers)
	try {
		await api.updateSessionRules({ removeRuleIds: appliedIds, addRules: rules })
		appliedIds = rules.map((rule) => rule.id)
		return true
	} catch {
		// A missing host grant or a rule limit: keep the previous rules and let the
		// request fail with the server's own error.
		return false
	}
}

/** Clear every rule this module added, used when the feature is turned off entirely. */
export async function clearOriginRules(): Promise<void> {
	await syncOriginStripping([])
}
