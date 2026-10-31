import { createWriteStream, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import archiver from 'archiver'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const manifest = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf8'))
const outputName = `${manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${manifest.version}.zip`
const outputPath = fileURLToPath(new URL(`../${outputName}`, import.meta.url))

const output = createWriteStream(outputPath)
const archive = archiver('zip', { zlib: { level: 1 } })

output.on('close', () => {
	console.log(`Packaged ${outputName} (${(archive.pointer() / 1024 / 1024).toFixed(1)} MB)`)
})

archive.on('warning', (error) => {
	if (error.code !== 'ENOENT') throw error
})
archive.on('error', (error) => {
	throw error
})

archive.pipe(output)

// Walk dist/ so the zip contains paths relative to the extension root.
function addDirectory(directory) {
	for (const entry of readdirSync(directory)) {
		const full = join(directory, entry)
		const name = relative(distDir, full)
		if (statSync(full).isDirectory()) addDirectory(full)
		else archive.file(full, { name })
	}
}

addDirectory(distDir)
await archive.finalize()
