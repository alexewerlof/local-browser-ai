import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))

/**
 * Empty a directory without removing it.
 *
 * Browsers installed as Flatpak receive a build directory through the document portal,
 * which grants the directory *inode*. Deleting and recreating it (which Vite's
 * `emptyOutDir` does) invalidates the grant and the browser can no longer load the
 * extension from it. So: remove the children, keep the directory.
 */
function emptyDirectory(directory) {
	let entries
	try {
		entries = readdirSync(directory)
	} catch {
		return
	}
	for (const entry of entries) {
		rmSync(join(directory, entry), { recursive: true, force: true })
	}
}

emptyDirectory(distDir)

await build({ configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)) })
await build({ configFile: fileURLToPath(new URL('../vite.sw.config.ts', import.meta.url)) })

console.log('Build complete: dist/')
