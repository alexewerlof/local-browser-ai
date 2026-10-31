import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { chromiumExecutablePath } from './browser.mjs'

/**
 * Loads the real unpacked extension into Chromium and checks the pieces the plain-page
 * harness cannot reach: the service worker, the typed RPC transport, the options page,
 * extension-only asset URLs, the page extractor, and the side panel behavior migration.
 *
 * Branded Google Chrome refuses `--load-extension`, so this must run on Playwright's
 * bundled Chromium.
 */
const DIST = resolve('dist')
const EXPECTED_ERRORS = [/The selected options are not supported/]

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Fixture Pricing</title>
<meta name="description" content="Fixture description">
<meta name="author" content="Ada Lovelace">
<meta property="article:published_time" content="2026-01-02">
<link rel="canonical" href="/canonical">
<link rel="icon" href="/favicon.ico">
<script>console.log('tracking script')</script>
<style>.x{color:red}</style>
</head>
<body>
<nav><a href="/nav">Navigation</a></nav>
<article>
  <h1>Pricing</h1>
  <p>Starter costs <strong>10 EUR</strong> per month.</p>
  <h2>Teams</h2>
  <p>Teams costs 25 EUR. <a href="/next?utm_source=news">Read more</a></p>
  <pre><code class="language-js">const price = 10</code></pre>
  <table><thead><tr><th>Plan</th><th>Price</th></tr></thead><tbody><tr><td>Starter</td><td>10</td></tr></tbody></table>
  <img src="/chart.png" alt="Chart">
  <div hidden>hidden-text-marker</div>
</article>
<my-widget></my-widget>
<iframe srcdoc="<p>iframe-content-text</p>"></iframe>
<script>
  class MyWidget extends HTMLElement {
    constructor() {
      super()
      this.attachShadow({ mode: 'open' }).innerHTML = '<p>shadow-content-text</p>'
    }
  }
  customElements.define('my-widget', MyWidget)
</script>
</body>
</html>`

function startFixtureServer() {
	const server = createServer((_request, response) => {
		response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
		response.end(FIXTURE_HTML)
	})
	return new Promise((resolveListen) => {
		server.listen(0, '127.0.0.1', () => {
			const address = server.address()
			resolveListen({
				url: `http://127.0.0.1:${address.port}/fixture`,
				close: () =>
					new Promise((done) => {
						// Chrome keeps the socket alive; without this the close hangs forever.
						server.closeAllConnections()
						server.close(() => done())
					}),
			})
		})
	})
}

const openContexts = []

async function launch(profile) {
	const context = await chromium.launchPersistentContext(profile, {
		executablePath: chromiumExecutablePath(),
		headless: false,
		args: ['--headless=new', `--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--no-sandbox'],
		// Playwright disables extensions by default; this switch must be dropped.
		ignoreDefaultArgs: ['--disable-extensions'],
	})
	openContexts.push(context)
	const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 20000 }))
	const extensionId = new URL(worker.url()).host
	return { context, extensionId }
}

/** Chromium may still be flushing its profile when we delete it. */
async function removeProfile(profile) {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		try {
			await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
			return
		} catch {
			await new Promise((done) => setTimeout(done, 300))
		}
	}
}

async function main() {
	const profile = await mkdtemp(join(tmpdir(), 'lbai-ext-'))
	const fixture = await startFixtureServer()
	const failures = []
	const pageErrors = []

	try {
		let { context, extensionId } = await launch(profile)
		console.log(`shows up as chrome-extension://${extensionId}`)

		const page = await context.newPage()
		page.on('pageerror', (error) => pageErrors.push(error.message))
		page.on('console', (message) => {
			if (message.type() === 'error' && !EXPECTED_ERRORS.some((pattern) => pattern.test(message.text()))) {
				failures.push(`console: ${message.text()}`)
			}
		})
		page.on('response', (response) => {
			if (response.status() >= 400) failures.push(`HTTP ${response.status()} ${response.url()}`)
		})

		await page.setViewportSize({ width: 520, height: 1100 })
		await page.goto(`chrome-extension://${extensionId}/side-panel.html`)
		await page.waitForSelector('.app', { timeout: 20000 })

		assert.equal(await page.locator('.composer__input').isVisible(), true)
		assert.equal(await page.locator('.header__name').textContent(), 'Local Browser AI')

		// 1. Toolbar clicks must reach the extension. Chrome persists the old
		//    `openPanelOnActionClick: true` behavior, which silently swallows onClicked.
		const behavior = await page.evaluate(() => chrome.sidePanel.getPanelBehavior())
		assert.equal(
			behavior.openPanelOnActionClick,
			false,
			'side panel behavior must let chrome.action.onClicked reach the extension',
		)

		// 2. Static assets resolve from the extension root.
		const iconOk = await page.evaluate(async () => (await fetch('./images/icon-32.png')).ok)
		assert.equal(iconOk, true, 'extension image asset did not resolve')

		// 3. The background answers the typed RPC protocol.
		const claimed = await page.evaluate(() =>
			chrome.runtime.sendMessage({ __lbai_rpc__: true, request: { type: 'panel.claim' } }),
		)
		assert.equal(claimed.ok, true)
		assert.ok(claimed.value.tabId === null || typeof claimed.value.tabId === 'number')

		const invalid = await page.evaluate(() =>
			chrome.runtime.sendMessage({ __lbai_rpc__: true, request: { type: 'nope' } }),
		)
		assert.equal(invalid.ok, false)
		assert.equal(invalid.error.kind, 'invalid-request')

		// 4. Real extraction: localhost is in host_permissions, so no activeTab grant is
		//    needed and the injected function runs against a real page.
		const fixtureTab = await context.newPage()
		await fixtureTab.goto(fixture.url)
		const extracted = await page.evaluate(async (url) => {
			const tabs = await chrome.tabs.query({})
			const target = tabs.find((tab) => tab.url === url)
			if (!target?.id) return { error: 'fixture tab not found' }
			return chrome.runtime.sendMessage({
				__lbai_rpc__: true,
				request: { type: 'tab.extract', tabId: target.id },
			})
		}, fixture.url)
		await fixtureTab.close()

		assert.equal(extracted.ok, true, `extraction failed: ${JSON.stringify(extracted)}`)
		const result = extracted.value
		assert.equal(result.title, 'Fixture Pricing')
		assert.equal(result.description, 'Fixture description')
		assert.equal(result.byline, 'Ada Lovelace')
		assert.equal(result.publishedTime, '2026-01-02')
		assert.match(result.canonicalUrl, /^http:\/\/127\.0\.0\.1:\d+\/canonical$/)
		assert.match(result.faviconUrl, /^http:\/\/127\.0\.0\.1:\d+\/favicon\.ico$/)

		// Content is kept; chrome, scripts and hidden nodes are dropped.
		assert.match(result.html, /Starter costs/)
		assert.doesNotMatch(result.html, /tracking script/)
		assert.doesNotMatch(result.html, /<nav/i)
		assert.doesNotMatch(result.html, /hidden-text-marker/)

		// Relative URLs are made absolute.
		assert.match(result.html, /href="http:\/\/127\.0\.0\.1:\d+\/next\?utm_source=news"/)
		assert.match(result.html, /src="http:\/\/127\.0\.0\.1:\d+\/chart\.png"/)

		// Open shadow roots and same-origin frames are flattened into the page content.
		assert.match(result.html, /shadow-content-text/)
		assert.match(result.html, /iframe-content-text/)

		// 5. The options page loads from the same manifest.
		const options = await context.newPage()
		options.on('pageerror', (error) => pageErrors.push(error.message))
		await options.goto(`chrome-extension://${extensionId}/options.html`)
		await options.waitForSelector('.options', { timeout: 20000 })
		assert.equal(await options.locator('.options__nav-item').count(), 6)
		await options.close()

		assert.deepEqual(pageErrors, [])
		assert.deepEqual(failures, [])
		await context.close()

		// 6. Migration: a profile left with the old behavior must be repaired on start.
		console.log('simulating a legacy profile…')
		;({ context, extensionId } = await launch(profile))
		const legacy = await context.newPage()
		await legacy.goto(`chrome-extension://${extensionId}/side-panel.html`)
		await legacy.waitForSelector('.app', { timeout: 20000 })
		await legacy.evaluate(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }))
		await context.close()
		;({ context, extensionId } = await launch(profile))
		const repaired = await context.newPage()
		await repaired.goto(`chrome-extension://${extensionId}/options.html`)
		await repaired.waitForSelector('.options', { timeout: 20000 })
		const deadline = Date.now() + 8000
		let current = await repaired.evaluate(() => chrome.sidePanel.getPanelBehavior())
		while (current.openPanelOnActionClick && Date.now() < deadline) {
			await new Promise((done) => setTimeout(done, 200))
			current = await repaired.evaluate(() => chrome.sidePanel.getPanelBehavior())
		}
		assert.equal(current.openPanelOnActionClick, false, 'the worker should reset a legacy panel behavior')
		await context.close()

		console.log('✔ extension: service worker, RPC, panel, options, extraction, behavior migration')
	} catch (error) {
		console.error(`✖ extension smoke test failed\n${error.stack ?? error}`)
		process.exitCode = 1
	} finally {
		await fixture.close()
		for (const context of openContexts) {
			await context.close().catch(() => {})
		}
		await removeProfile(profile)
	}
}

main()
