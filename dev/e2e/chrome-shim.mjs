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
 */
export function chromeShim(config = {}) {
	const STORAGE_KEY = '__lb_ai_storage__'
	let persisted = {}
	try {
		persisted = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}')
	} catch {
		persisted = {}
	}

	const seeded = { ...(config.storage ?? {}) }
	if (config.settings) seeded['settings.v1'] = config.settings
	// Persisted values win on reload; the scenario config only seeds a fresh page.
	const storage = new Map(Object.entries({ ...seeded, ...persisted }))

	const changeListeners = []
	const messageListeners = []

	function flushStorage() {
		try {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(storage)))
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
	let pendingTabId = config.tab ? tab.id : null
	const opened = []
	const searches = []
	// Tabs beyond the attached one, so a scenario can start with Settings already open.
	const otherTabs = (config.openTabs ?? []).map((path, index) => ({
		id: 500 + index,
		windowId: 2,
		active: false,
		url: new URL(path, location.href).toString(),
		title: 'Settings',
	}))
	let nextTabId = 600
	const updatedTabs = []
	const focusedWindows = []

	async function handleRequest(request) {
		switch (request.type) {
			case 'panel.claim': {
				const id = pendingTabId
				pendingTabId = null
				return { ok: true, value: { tabId: id } }
			}
			case 'tab.info':
				return { ok: true, value: tab }
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
				return { ok: true, value: extraction }
			}
			case 'tab.selection':
				return { ok: true, value: { text: config.selection ?? '' } }
			case 'tab.open': {
				opened.push(request.url)
				return { ok: true, value: { tabId: 999 } }
			}
			case 'search.query': {
				searches.push({ text: request.text, disposition: request.disposition })
				return { ok: true, value: { disposition: request.disposition } }
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
						notify(key, value, oldValue)
					}
					flushStorage()
				},
				async remove(keys) {
					for (const key of Array.isArray(keys) ? keys : [keys]) {
						const oldValue = storage.get(key)
						storage.delete(key)
						notify(key, undefined, oldValue)
					}
					flushStorage()
				},
				async clear() {
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
					for (const [key, value] of Object.entries(items)) storage.set(`session:${key}`, value)
				},
				async remove(keys) {
					for (const key of Array.isArray(keys) ? keys : [keys]) storage.delete(`session:${key}`)
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
			async request() {
				return true
			},
			async contains() {
				return true
			},
			async remove() {
				return true
			},
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
			async query() {
				return [tab, ...otherTabs]
			},
			async get(id) {
				return [tab, ...otherTabs].find((entry) => entry.id === id) ?? tab
			},
			async create({ url }) {
				opened.push(url)
				const created = { id: nextTabId++, windowId: 2, active: true, url, title: '' }
				otherTabs.push(created)
				return created
			},
			async update(id, props) {
				const target = [tab, ...otherTabs].find((entry) => entry.id === id)
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
		/** `tabs.update` calls, in order: the tab the app activated (and navigated, if any). */
		updatedTabs,
		focusedWindows,
		setExtraction(next) {
			extraction = next
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
