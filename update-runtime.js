import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RUNTIME_DIR = 'runtime'
// Since this script is in the root, __dirname is not available in ESM by default.
const __dirname = dirname(fileURLToPath(import.meta.url))

const filesToCopy = [
    'ort-wasm-simd-threaded.jsep.mjs',
    'ort-wasm-simd-threaded.jsep.wasm',
    'ort-wasm-simd-threaded.wasm',
]

async function copyRuntimeFiles() {
    const sourceDir = join(__dirname, 'node_modules', 'onnxruntime-web', 'dist')
    const destDir = join(__dirname, RUNTIME_DIR)

    console.log(`Creating destination directory: ${destDir}`)
    await fs.mkdir(destDir, { recursive: true })

    await Promise.all(
        filesToCopy.map((file) => {
            const src = join(sourceDir, file)
            const dest = join(destDir, file)
            console.time(`${src} -> ${dest}`)
            fs.copyFile(join(sourceDir, file), join(destDir, file))
            console.timeEnd(`${src} -> ${dest}`)
        }),
    )

    return `Copied runtime files to: ${destDir}`
}

copyRuntimeFiles().then(console.log).catch(console.error)
