import fs, { promises as fsPromises } from 'node:fs'
import archiver from 'archiver'
import manifest from './manifest.json' with { type: 'json' }

// Read manifest to get name and version for the output filename.
const name = manifest.name.toLowerCase().replace(/\s+/g, '-')
const version = manifest.version
const OUTPUT_FILENAME = `${name}-${version}.zip`

console.log(`Creating extension package: ${OUTPUT_FILENAME}`)

async function ignoreFiles(fileName) {
    // Throws if the file does not exist
    const ignoreFileContents = await fsPromises.readFile(fileName, 'utf-8')
    return ignoreFileContents
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line !== '')
        .filter(line => !line.startsWith('#'))
}

async function createPackage() {
    const output = fs.createWriteStream(OUTPUT_FILENAME)
    let fileCount = 0

    // Handle errors on the output stream (the file system stream)
    output.on('error', (err) => {
        console.error(`Output stream error: ${err.message}`)
        throw err // Re-throw to ensure the process exits with an error
    })

    output.on('close', () => {
        console.log(`Total ${fileCount} files. ${archive.pointer()} bytes.`)
    })

    // level 0 means no compression, 1 optimizes for speed and higher values result in smaller file size
    const archive = archiver('zip', { zlib: { level: 1 } })

    // Log each file that is added to the archive
    archive.on('entry', (entry) => {
        fileCount++
        console.log(`  adding: ${entry.name} (${entry.stats.size} bytes)`)
    })

    archive.on('error', (err) => {
        console.error(`Archiver error: ${err.message}`)
        throw err
    })

    archive.pipe(output)

    // Use glob to include all files, respecting the ignore patterns
    archive.glob('**/*', {
        ignore: await ignoreFiles('.buildignore'),
        nodir: true // This will only match files, not directories
    })

    return await archive.finalize()
}

try {
    await createPackage()
} catch (err) {
    console.error(`Error creating package: ${err.message}`)
}
