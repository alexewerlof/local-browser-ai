import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url))
const swConfigFile = fileURLToPath(new URL('../vite.sw.config.ts', import.meta.url))

// Watch mode: rebuilding the panel and the service worker on every change.
// Static assets live in public/ and are copied by Vite.
await Promise.all([
	build({ configFile, build: { watch: {} } }),
	build({ configFile: swConfigFile, build: { watch: {} } }),
])

console.log('Watching for changes. Reload the extension in chrome://extensions to pick them up.')
