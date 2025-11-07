import * as esbuild from 'esbuild'
import { join } from 'node:path'
import packageJson from './package.json' with { type: 'json' }

const CONFIG_KEY = '_vendor'
const VENDOR_DIR = 'vendor'

const resolveDir = process.cwd()

function normalizedConfig(name, config) {
    if (typeof name !== 'string') {
        throw new TypeError(`Package name must be a string. Got ${name} (${typeof name})`)
    }

    switch (typeof config) {
        case 'undefined':
            return {
                contents: `export * from '${name}'`,
                define: {},
            }
        case 'string':
            return {
                contents: `export ${config} from '${name}'`,
                define: {},
            }
        case 'object': {
            const what = config.what || '*'
            const where = config.where || name
            return {
                contents: `export ${what} from '${where}'`,
                define: config.define || {},
            }
        }
    }
}

function getConfig(name) {
    const { contents, define } = normalizedConfig(name, packageJson?.[CONFIG_KEY]?.[name])
    console.log(`${name}: ${contents}`)
    return {
        bundle: true,
        minify: false,
        format: 'esm',
        define,
        stdin: {
            contents,
            resolveDir,
            loader: 'js',
        },
        outfile: join(VENDOR_DIR, `${name}.js`),
    }
}

const dependencies = Object.keys(packageJson.dependencies)
console.log(`Updating ${VENDOR_DIR} for ${dependencies.length} deps: ${dependencies.join(', ')}`)

try {
    console.time('Build')
    await Promise.all(dependencies.map((name) => esbuild.build(getConfig(name))))
    console.timeEnd('Build')
    console.log(`Updated ${VENDOR_DIR} dir.`)
} catch (err) {
    console.error(err)
}
