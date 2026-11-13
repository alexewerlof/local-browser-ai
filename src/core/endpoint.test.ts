import { describe, expect, it } from 'vitest'
import { insecureEndpoint, isLoopbackHost } from './endpoint'

describe('isLoopbackHost', () => {
	it('accepts the loopback names a provider editor can be given', () => {
		for (const host of [
			'localhost',
			'LOCALHOST',
			'api.localhost',
			'127.0.0.1',
			'127.1.2.3',
			'0.0.0.0',
			'::1',
			'[::1]',
			'::ffff:127.0.0.1',
		]) {
			expect(isLoopbackHost(host), host).toBe(true)
		}
	})

	it('rejects anything that leaves the machine', () => {
		for (const host of ['mac-mini.localdomain', '192.168.1.20', '10.0.0.5', 'models.example.com', '128.0.0.1']) {
			expect(isLoopbackHost(host), host).toBe(false)
		}
	})
})

describe('insecureEndpoint', () => {
	it('warns about a plain HTTP address on the network', () => {
		const warning = insecureEndpoint('http://mac-mini.localdomain:8080/v1')
		expect(warning?.title).toBe('Unencrypted connection')
		expect(warning?.detail).toMatch(/VPN or a network you trust/)
		expect(warning?.summary).toBe(
			'Unencrypted traffic exposes your prompt and attached pages. Only use over VPN or trusted networks.',
		)
	})

	it('never repeats the address, which is already on screen beside the mark', () => {
		const warning = insecureEndpoint('http://mac-mini.localdomain:8080/v1')
		for (const sentence of [warning?.title, warning?.detail, warning?.summary]) {
			expect(sentence).not.toContain('mac-mini')
			expect(sentence).not.toContain(':8080')
		}
	})

	it('stays quiet for an encrypted address', () => {
		expect(insecureEndpoint('https://models.example.com/v1')).toBeNull()
	})

	it('stays quiet for loopback, which never crosses a network', () => {
		expect(insecureEndpoint('http://localhost:9931/v1')).toBeNull()
		expect(insecureEndpoint('http://127.0.0.1:1/v1')).toBeNull()
		expect(insecureEndpoint('http://[::1]:8080/v1')).toBeNull()
	})

	it('ignores an empty or half-typed address', () => {
		expect(insecureEndpoint(undefined)).toBeNull()
		expect(insecureEndpoint('   ')).toBeNull()
		expect(insecureEndpoint('http://')).toBeNull()
	})
})
