import { describe, it } from 'node:test'
import assert from 'node:assert'
import manifestJson from './manifest.json' with { type: 'json' }
import packageJson from './package.json' with { type: 'json' }

describe('manifest.json', () => {
    it('has the same version as package.json', () => {
        assert(manifestJson.version === packageJson.version)
    })
})
