/**
 * Installed in the page before any app script runs. Provides the slice of the
 * `chrome.*` API the panel and Settings page use, so the real UI can run as an
 * ordinary web page.
 *
 * @param {object} config
 * @param {object} [config.settings] Seed for `chrome.storage.local["settings.v1"]`.
 * @param {Record<string, unknown>} [config.storage] Extra storage entries.
 * @param {object} [config.tab] The tab the extension is attached to.
 * @param {object} [config.extraction] Result returned by `tab.extract`.
 * @param {string} [config.selection] Text returned by `tab.selection`.
 * @param {string[]} [config.openTabs] Already-open tabs, as paths resolved against the page.
 * @param {boolean} [config.denyExtraction] Make extraction fail like a missing activeTab grant.
 * @param {'granted'|'ask'|'deny'} [config.hostAccess] Whether site access is already granted
 *   (`granted`, the default), still waiting for the user (`ask`), or refused (`deny`).
 */
export function chromeShim(config = {}) {
	const STORAGE_KEY = '__lb_ai_storage__'
	const DELETED_KEY = '__lb_ai_deleted__'
	let persisted
	try {
		persisted = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}')
	} catch {
		persisted = {}
	}

	/**
	 * Keys the app removed. Without them a reload would revive every seeded key, because
	 * the scenario config is applied again on each navigation — so "taken once" would be
	 * untestable.
	 */
	let deleted
	try {
		deleted = new Set(JSON.parse(sessionStorage.getItem(DELETED_KEY) ?? '[]'))
	} catch {
		deleted = new Set()
	}

	const seeded = { ...(config.storage ?? {}) }
	if (config.settings) seeded['settings.v1'] = config.settings
	for (const key of deleted) delete seeded[key]
	// Persisted values win on reload; the scenario config only seeds a fresh page.
	const storage = new Map(Object.entries({ ...seeded, ...persisted }))

	const changeListeners = []
	const messageListeners = []

	function flushStorage() {
		try {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(storage)))
			sessionStorage.setItem(DELETED_KEY, JSON.stringify([...deleted]))
		} catch {
			// Storage can be unavailable; tests still work within one page load.
		}
	}

	function notify(key, newValue, oldValue) {
		const changes = { [key]: { oldValue, newValue } }
		for (const listener of changeListeners) {
			try {
				listener(changes, 'local')
			} catch {
				// ignore
			}
		}
	}

	/** Delete a value and remember the deletion, so the next page load cannot revive it. */
	function deleteStored(key) {
		storage.delete(key)
		deleted.add(key)
	}

	const inertEvent = () => {
		const listeners = []
		return {
			addListener(listener) {
				listeners.push(listener)
			},
			removeListener(listener) {
				const index = listeners.indexOf(listener)
				if (index >= 0) listeners.splice(index, 1)
			},
			hasListener: (listener) => listeners.includes(listener),
			emit(...args) {
				for (const listener of listeners) listener(...args)
			},
		}
	}

	const tab = {
		id: config.tab?.id ?? 42,
		windowId: config.tab?.windowId ?? 1,
		url: config.tab?.url ?? 'https://example.com/pricing',
		title: config.tab?.title ?? 'Example Pricing',
		favIconUrl: config.tab?.favIconUrl ?? '',
		// A tab that has finished loading, so anything waiting on the load resolves at once.
		status: 'complete',
		// Ungrouped, like `chrome.tabGroups.TAB_GROUP_ID_NONE`.
		groupId: -1,
	}

	const defaultExtraction = {
		url: tab.url,
		baseUrl: tab.url,
		canonicalUrl: tab.url,
		title: tab.title,
		description: 'Example document for the harness',
		lang: 'en',
		faviconUrl: '',
		byline: '',
		publishedTime: '',
		selection: '',
		truncated: false,
		text: 'Pricing plans start at 10 EUR per month for the Starter plan.',
		html: [
			'<html><head><title>Example Pricing</title></head><body>',
			'<article>',
			'<h1>Pricing</h1>',
			'<p>Our pricing is simple. The Starter plan costs 10 EUR per month and includes one seat.</p>',
			'<h2>Teams</h2>',
			'<p>The Teams plan costs 25 EUR per month per seat and adds shared workspaces and audit logs.</p>',
			'<h2>Enterprise</h2>',
			'<p>Enterprise pricing is annual and includes a dedicated support engineer.</p>',
			'<h2>FAQ</h2>',
			'<p>Can I change plans at any time? Yes. Upgrades are prorated.</p>',
			'</article>',
			'</body></html>',
		].join(''),
	}

	let extraction = config.extraction ?? defaultExtraction
	/** Extraction per tab id, for scenarios that add more than one page. */
	const extractionByTab = new Map()
	// `config.tab` means "the user added this page before the panel opened".
	let pendingTabs = config.tab ? [config.tab.id ?? 42] : []
	const opened = []
	const searches = []
	/**
	 * Site access the shim currently grants, and the requests the extension made.
	 *
	 * `config.hostAccess` decides the starting point: `granted` answers every check, `ask`
	 * makes the extension offer a chip and wait, `deny` refuses both the chip's grant and
	 * the modal. A scenario grants with `__LB_AI_TEST__.grantHostAccess(pattern).`
	 */
	let hostAccess = config.hostAccess ?? 'granted'
	const grantedOrigins = new Set()
	const hostAccessRequests = []
	const hostAccessRemoved = []
	const permissionsAdded = inertEvent()
	/** `page.focus` calls, in order: which page a card click asked to bring back. */
	const focusedPages = []
	// Tabs beyond the attached one, so a scenario can start with Settings already open.
	const otherTabs = (config.openTabs ?? []).map((path, index) => ({
		id: 500 + index,
		windowId: 2,
		active: false,
		url: new URL(path, location.href).toString(),
		title: 'Settings',
		groupId: -1,
	}))
	/** The fixture tab first, then anything a scenario or the app opened. */
	const tabsById = () => [tab, ...otherTabs].filter((entry) => !entry.closed)
	let nextTabId = 600
	/** Tab groups, as Chrome would hold them: one id per group, tabs point at it. */
	const tabGroups = new Map()
	let nextGroupId = 900
	const updatedTabs = []
	const focusedWindows = []

	/** A tab a tool or the panel opened: real, findable and ungrouped. */
	function openTab(url, extra = {}) {
		const created = {
			id: nextTabId++,
			windowId: 2,
			active: true,
			status: 'complete',
			title: url,
			url,
			favIconUrl: '',
			groupId: -1,
			...extra,
		}
		otherTabs.push(created)
		return created
	}

	async function handleRequest(request) {
		switch (request.type) {
			case 'page.pending': {
				const tabIds = pendingTabs
				pendingTabs = []
				return { ok: true, value: { tabIds } }
			}
			case 'prompt.pending': {
				// Same take-once contract as the worker: the entry is gone the moment a panel
				// takes it, so a reload cannot replay it.
				const key = 'session:pendingOmniboxPrompt'
				const prompt = storage.get(key) ?? null
				if (prompt) {
					deleteStored(key)
					flushStorage()
				}
				return { ok: true, value: { prompt } }
			}
			case 'page.focus': {
				focusedPages.push({ tabId: request.tabId ?? null, url: request.url })
				// A tab still showing the page is the user's own; one that is gone comes back as
				// a tab the extension opened, which is what the panel groups.
				const existing = tabsById().find((entry) => entry.id === request.tabId)
				if (existing) return { ok: true, value: { tabId: existing.id, opened: false } }
				const created = openTab(request.url)
				return { ok: true, value: { tabId: created.id, opened: true } }
			}
			case 'tab.info':
				return { ok: true, value: tabsById().find((entry) => entry.id === request.tabId) ?? tab }
			case 'tab.extract': {
				if (config.denyExtraction) {
					return {
						ok: false,
						error: {
							kind: 'permission',
							message: 'Could not read this page. Open the extension from the toolbar first.',
						},
					}
				}
				return { ok: true, value: extractionByTab.get(request.tabId) ?? extraction }
			}
			case 'tab.selection':
				return { ok: true, value: { text: config.selection ?? '' } }
			case 'tab.open': {
				opened.push(request.url)
				// A real tab, not a bare id: `tab.info` and `tab.extract` look it up, and a
				// missing one silently falls back to the fixture tab.
				const created = openTab(request.url)
				return { ok: true, value: { tabId: created.id } }
			}
			case 'search.query': {
				searches.push({
					text: request.text,
					disposition: request.disposition,
					conversationId: request.conversationId,
				})
				// The worker works the results tab out of the tabs that appeared around the call;
				// the shim creates one, so a search leaves a real tab behind like a browser does.
				const results = openTab(`https://www.google.com/search?q=${encodeURIComponent(request.text)}`, {
					title: `${request.text} - Search`,
				})
				return { ok: true, value: { disposition: request.disposition, tabId: results.id, url: results.url } }
			}
			default:
				return { ok: false, error: { kind: 'invalid-request', message: 'Unknown request' } }
		}
	}

	function sendMessage(message) {
		if (message && message.__lbai_rpc__ === true) {
			return handleRequest(message.request)
		}
		return new Promise((resolve) => {
			let answered = false
			const sendResponse = (response) => {
				if (answered) return
				answered = true
				resolve(response)
			}
			for (const listener of messageListeners) {
				try {
					if (listener(message, { id: 'harness' }, sendResponse) === true) return
				} catch (error) {
					console.debug('Message listener rejected a message', error)
				}
			}
			resolve(undefined)
		})
	}

	globalThis.chrome = {
		runtime: {
			id: 'harness',
			getManifest: () => globalThis.__LB_AI_MANIFEST__ ?? { name: 'Local Browser AI', version: '0.0.0' },
			getURL: (path) => new URL(path, location.href).toString(),
			sendMessage,
			onMessage: {
				addListener(listener) {
					messageListeners.push(listener)
				},
				removeListener(listener) {
					const index = messageListeners.indexOf(listener)
					if (index >= 0) messageListeners.splice(index, 1)
				},
			},
			openOptionsPage: async () => {
				window.__lbaiOpenSettingsRequested = true
			},
			onConnect: inertEvent(),
			onInstalled: inertEvent(),
			connect() {
				throw new Error('chrome.runtime.connect is not available in the harness')
			},
		},
		storage: {
			local: {
				async get(keys) {
					if (keys == null) return Object.fromEntries(storage)
					if (typeof keys === 'string') {
						return storage.has(keys) ? { [keys]: storage.get(keys) } : {}
					}
					if (Array.isArray(keys)) {
						return Object.fromEntries(
							keys.filter((key) => storage.has(key)).map((key) => [key, storage.get(key)]),
						)
					}
					const result = {}
					for (const [key, fallback] of Object.entries(keys)) {
						result[key] = storage.has(key) ? storage.get(key) : fallback
					}
					return result
				},
				async set(items) {
					for (const [key, value] of Object.entries(items)) {
						const oldValue = storage.get(key)
						storage.set(key, value)
						deleted.delete(key)
						notify(key, value, oldValue)
					}
					flushStorage()
				},
				async remove(keys) {
					for (const key of Array.isArray(keys) ? keys : [keys]) {
						const oldValue = storage.get(key)
						deleteStored(key)
						notify(key, undefined, oldValue)
					}
					flushStorage()
				},
				async clear() {
					for (const key of Object.keys(seeded)) deleted.add(key)
					storage.clear()
					flushStorage()
				},
			},
			session: {
				async get(keys) {
					if (typeof keys === 'string') {
						return storage.has(`session:${keys}`) ? { [keys]: storage.get(`session:${keys}`) } : {}
					}
					return {}
				},
				async set(items) {
					for (const [key, value] of Object.entries(items)) {
						storage.set(`session:${key}`, value)
						deleted.delete(`session:${key}`)
					}
					flushStorage()
				},
				async remove(keys) {
					for (const key of Array.isArray(keys) ? keys : [keys]) deleteStored(`session:${key}`)
					flushStorage()
				},
			},
			onChanged: {
				addListener(listener) {
					changeListeners.push(listener)
				},
				removeListener(listener) {
					const index = changeListeners.indexOf(listener)
					if (index >= 0) changeListeners.splice(index, 1)
				},
			},
		},
		permissions: {
			async request({ origins = [] } = {}) {
				if (hostAccess === 'deny') return false
				// An accepted prompt: the grant lands origin by origin, like Chrome's own.
				for (const origin of origins) grantedOrigins.add(origin)
				if (origins.length > 0) permissionsAdded.emit({ origins })
				return true
			},
			async contains({ origins = [] } = {}) {
				if (hostAccess === 'granted') return true
				return origins.length > 0 && origins.every((origin) => grantedOrigins.has(origin))
			},
			async remove() {
				return true
			},
			async addHostAccessRequest({ tabId } = {}) {
				hostAccessRequests.push(tabId)
			},
			async removeHostAccessRequest({ tabId } = {}) {
				hostAccessRemoved.push(tabId)
			},
			onAdded: permissionsAdded,
		},
		contextMenus: {
			create() {},
			update: async () => {},
			removeAll: async (callback) => callback?.(),
			onClicked: inertEvent(),
		},
		sidePanel: {
			setPanelBehavior: async () => {},
			open: async () => {},
		},
		action: { onClicked: inertEvent() },
		windows: {
			create: async () => ({ tabs: [{ id: 999 }] }),
			async update(id, props) {
				focusedWindows.push({ id, ...props })
				return { id }
			},
		},
		scripting: {
			async executeScript() {
				return [{ result: extraction }]
			},
		},
		tabs: {
			// The attached tab first, then whatever the scenario says is already open.
			async query(queryInfo = {}) {
				const all = tabsById()
				// `groupId` is the one filter the app relies on: it is how a stored group id
				// is checked without the `tabGroups` permission.
				if (typeof queryInfo.groupId === 'number') {
					return all.filter((entry) => entry.groupId === queryInfo.groupId)
				}
				return all
			},
			async get(id) {
				return tabsById().find((entry) => entry.id === id) ?? tab
			},
			async create({ url }) {
				opened.push(url)
				return openTab(url)
			},
			/** Group tabs, creating the group when no live one is named — like Chrome. */
			async group({ tabIds, groupId, createProperties } = {}) {
				const ids = Array.isArray(tabIds) ? tabIds : [tabIds]
				let target = groupId
				if (target === undefined) {
					target = nextGroupId++
					const first = tabsById().find((entry) => entry.id === ids[0])
					tabGroups.set(target, { id: target, windowId: createProperties?.windowId ?? first?.windowId ?? 1 })
				} else if (!tabGroups.has(target)) {
					// Chrome rejects an id that no longer names a group; the app recovers by
					// asking for a new one.
					throw new Error(`No group with id: ${target}`)
				}
				for (const id of ids) {
					const entry = tabsById().find((candidate) => candidate.id === id)
					if (entry) entry.groupId = target
				}
				return target
			},
			async update(id, props) {
				const target = tabsById().find((entry) => entry.id === id)
				if (target) {
					if (props.url !== undefined) target.url = props.url
					if (props.active !== undefined) target.active = props.active
				}
				updatedTabs.push({ id, ...props })
				return target
			},
			async sendMessage(message) {
				return sendMessage(message)
			},
			onActivated: inertEvent(),
			onUpdated: inertEvent(),
		},
	}

	globalThis.__LB_AI_MANIFEST__ = globalThis.__LB_AI_MANIFEST__ ?? {
		name: 'Local Browser AI',
		version: '3.0.0-test',
	}

	globalThis.__LB_AI_TEST__ = {
		opened,
		searches,
		focusedPages,
		/** Tabs the extension asked Chrome to show a host access chip on. */
		hostAccessRequests,
		/** Tabs whose chip the extension took back (cancel, or after a grant). */
		hostAccessRemoved,
		/**
		 * Accept the host access request in the address bar, as the user would.
		 * The origins are the ones the extension asked for, e.g. `https://example.com/*`.
		 */
		grantHostAccess(...origins) {
			for (const origin of origins) grantedOrigins.add(origin)
			permissionsAdded.emit({ origins })
		},
		/** Switch `config.hostAccess` at runtime, for a second turn in one page load. */
		setHostAccess(next) {
			hostAccess = next
		},
		/** `tabs.update` calls, in order: the tab the app activated (and navigated, if any). */
		updatedTabs,
		focusedWindows,
		/**
		 * The tab groups on the strip, with the tabs each one holds.
		 * A group with no tabs left is gone, because Chrome deletes it.
		 */
		get tabGroups() {
			return [...tabGroups.values()]
				.map((group) => ({
					id: group.id,
					windowId: group.windowId,
					tabs: tabsById()
						.filter((entry) => entry.groupId === group.id)
						.map((entry) => entry.id),
				}))
				.filter((group) => group.tabs.length > 0)
		},
		/** Close every tab of a group, as clicking the group's X does. */
		closeGroup(groupId) {
			for (const entry of tabsById()) {
				if (entry.groupId === groupId) entry.closed = true
			}
		},
		/** Close one tab, so a card has to reopen its page. */
		closeTab(tabId) {
			const tabToClose = tabsById().find((entry) => entry.id === tabId)
			if (tabToClose) tabToClose.closed = true
		},
		setExtraction(next) {
			extraction = next
		},
		/** Simulate "Add this page to chat" from the context menu. */
		addPage(nextTab = tab.id, nextExtraction) {
			const descriptor = typeof nextTab === 'number' ? { id: nextTab } : nextTab
			if (!tabsById().some((entry) => entry.id === descriptor.id)) {
				otherTabs.push({
					windowId: 2,
					active: false,
					title: 'Page',
					favIconUrl: '',
					groupId: -1,
					...descriptor,
				})
			}
			if (nextExtraction) extractionByTab.set(descriptor.id, nextExtraction)
			if (!pendingTabs.includes(descriptor.id)) pendingTabs.push(descriptor.id)
			globalThis.__LB_AI_TEST__.emit({ type: 'page.add', tabId: descriptor.id })
		},
		/**
		 * Simulate a prompt accepted in the address bar on the tab on screen.
		 *
		 * The worker stores one entry and nudges the panel; the panel takes it with
		 * `prompt.pending`. Seeding `session:pendingOmniboxPrompt` before load covers the
		 * panel-that-boots case, and this covers the panel-already-open one.
		 */
		omniboxPrompt(text, nextTab = tab.id) {
			const key = 'session:pendingOmniboxPrompt'
			storage.set(key, { text, tabId: nextTab, createdAt: Date.now() })
			deleted.delete(key)
			flushStorage()
			globalThis.__LB_AI_TEST__.emit({ type: 'prompt.add' })
		},
		setSettings(settings) {
			const oldValue = storage.get('settings.v1')
			storage.set('settings.v1', settings)
			flushStorage()
			notify('settings.v1', settings, oldValue)
		},
		emit(event) {
			const message = { __lbai_event__: true, event }
			for (const listener of messageListeners) {
				try {
					listener(message, { id: 'harness' }, () => {})
				} catch {
					// ignore
				}
			}
		},
		async readSettings() {
			return storage.get('settings.v1')
		},
		/** Synchronous accessor for `waitForFunction` polling. */
		currentSettings() {
			return storage.get('settings.v1')
		},
		async readMemory() {
			return storage.get('memory.v1')
		},
		/** Synchronous accessor for `waitForFunction` polling. */
		currentMemory() {
			return storage.get('memory.v1')
		},
	}
}
