import { createWriteStream, readFileSync, statSync } from 'node:fs'
import { glob, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import archiver from 'archiver'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const ignoreFile = fileURLToPath(new URL('../.packageignore', import.meta.url))
const manifest = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf8'))
const outputName = `${manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${manifest.version}.zip`
const outputPath = fileURLToPath(new URL(`../${outputName}`, import.meta.url))

const output = createWriteStream(outputPath)
const archive = archiver('zip', { zlib: { level: 1 } })

output.on('close', () => {
	console.log(`Packaged ${outputName} (${(archive.pointer() / 1024 / 1024).toFixed(1)} MB, ${shipped} files)`)
})

archive.on('warning', (error) => {
	if (error.code !== 'ENOENT') throw error
})
archive.on('error', (error) => {
	throw error
})

archive.pipe(output)

/**
 * Read `.packageignore` and return glob exclusion patterns for `dist/`.
 *
 * The format is deliberately .gitignore-shaped: one pattern per line, `#` comments and blank
 * lines skipped. A pattern with no `/` matches at any depth, as it does in .gitignore, so
 * `AGENTS.md` also covers `assets/AGENTS.md`; a pattern containing a `/` is anchored to the
 * extension root. A missing file is an error: packing everything by accident is worse than
 * failing loudly.
 */
async function readPackageIgnore(file) {
	let text
	try {
		text = await readFile(file, 'utf8')
	} catch (error) {
		if (error.code === 'ENOENT') {
			throw new Error(`Missing ${relative(process.cwd(), file)}: it decides what stays out of the zip.`, {
				cause: error,
			})
		}
		throw error
	}

	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith('#'))
		.map((pattern) => (pattern.includes('/') ? pattern : `**/${pattern}`))
}

const ignored = await readPackageIgnore(ignoreFile)

/**
 * Add everything in dist/ that `.packageignore` does not exclude.
 *
 * `glob` yields directories as well as files - and excluding `images/**` still yields the
 * `images` entry itself - so only regular files are appended to the archive.
 */
let shipped = 0
for await (const name of glob('**/*', { cwd: distDir, exclude: ignored })) {
	const full = join(distDir, name)
	if (!statSync(full).isFile()) continue
	archive.file(full, { name })
	shipped += 1
}

if (ignored.length > 0) console.log(`Left out by .packageignore: ${ignored.join(', ')}`)
await archive.finalize()
