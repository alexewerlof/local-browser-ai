import { pipeline, env } from '@huggingface/transformers'
import { join } from 'node:path'
import { embedding } from './modelsconfig.js'

const MODELS_DIR = 'models'

async function downloadModels() {
    // Set the cache directory to a local folder
    env.cacheDir = join(process.cwd(), MODELS_DIR)

    console.log(`Downloading models to: ${env.cacheDir}`)
    const { model, dtype } = embedding
    console.log(`  Downloading ${model}...`)
    await pipeline('feature-extraction', model, { dtype })
    console.log(`  Finished downloading ${model}.`)
    return 'All models downloaded successfully.'
}

downloadModels().then(console.log).catch(console.error)
