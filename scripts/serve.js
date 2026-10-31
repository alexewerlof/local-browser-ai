import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const port = Number(process.env.PORT ?? 4173)

const contentTypes = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.wasm': 'application/wasm',
	'.map': 'application/json; charset=utf-8',
}

/** Resolve a URL path inside dist/ while refusing to escape it. */
function safePath(urlPath) {
	const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '')
	return resolve(distDir, `.${clean.startsWith('/') ? clean : `/${clean}`}`)
}

/**
 * Inject the extension manifest so the web harness can answer `chrome.runtime.getManifest()`.
 * Real extension pages get this from the browser.
 */
function withHarness(html) {
	let manifest = '{}'
	try {
		manifest = readFileSync(join(distDir, 'manifest.json'), 'utf8')
	} catch {
		// No build yet; the page will report it.
	}
	const tag = `<script>window.__LB_AI_MANIFEST__=${manifest}</script>`
	return html.includes('</head>') ? html.replace('</head>', `${tag}</head>`) : `${tag}${html}`
}

const server = createServer((request, response) => {
	const pathname = request.url ?? '/'
	let filePath = safePath(pathname)

	if (existsSync(filePath) && statSync(filePath).isDirectory()) {
		filePath = join(filePath, 'index.html')
	}
	if (!existsSync(filePath) && !extname(filePath)) {
		filePath = `${filePath}.html`
	}
	if (!existsSync(filePath)) {
		response.writeHead(404, { 'Content-Type': 'text/plain' })
		response.end('Not found')
		return
	}

	const ext = extname(filePath)
	const type = contentTypes[ext] ?? 'application/octet-stream'
	response.writeHead(200, {
		'Content-Type': type,
		'Cache-Control': 'no-store',
		'Access-Control-Allow-Origin': '*',
	})

	if (ext === '.html') {
		response.end(withHarness(readFileSync(filePath, 'utf8')))
		return
	}
	createReadStream(filePath).pipe(response)
})

server.listen(port, '127.0.0.1', () => {
	console.log(`Harness server: http://localhost:${port}/side-panel.html`)
})
