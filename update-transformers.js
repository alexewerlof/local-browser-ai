import { join, dirname } from 'node:path'
import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pipeline, env } from '@huggingface/transformers'
import { embedding, MODELS_DIR, RUNTIME_DIR } from './config-transformers.js.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// These are the required WASM files for both CPU (WASM) and GPU (WebGPU) execution
// in recent versions of onnxruntime-web.
const RUNTIME_FILES = [
    'ort-wasm-simd-threaded.mjs',
    'ort-wasm-simd-threaded.wasm',
    'ort-wasm-simd-threaded.jsep.mjs',
    'ort-wasm-simd-threaded.jsep.wasm',
]

async function downloadModels() {
    // Set the cache directory to a local folder
    env.cacheDir = join(process.cwd(), MODELS_DIR)

    console.log(`Copying models to: ${env.cacheDir}`)
    const { model, dtype } = embedding
    console.time(`Cache ${model}`)
    await pipeline('feature-extraction', model, { dtype })
    console.timeEnd(`Cache ${model}`)
    return 'All models downloaded successfully.'
}

async function copyRuntimeFiles() {
    const sourceDir = join(__dirname, 'node_modules', 'onnxruntime-web', 'dist')
    const destDir = join(__dirname, RUNTIME_DIR)

    console.log(`Copying runtime to: ${destDir}`)
    await fs.mkdir(destDir, { recursive: true })

    await Promise.all(
        RUNTIME_FILES.map(async (file) => {
            console.time(`Copy ${file}`)
            await fs.copyFile(join(sourceDir, file), join(destDir, file))
            console.timeEnd(`Copy ${file}`)
        }),
    )

    return `Copied runtime files to: ${destDir}`
}

async function main() {
    await downloadModels()
    await copyRuntimeFiles()
    return 'Finished main successfully'
}

main().then(console.log).catch(console.error)
