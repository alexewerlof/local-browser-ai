import { defineConfig } from 'vitest/config'

/**
 * The benchmark needs a DOM (Readability, Turndown and the injectable extractor all
 * touch it), so it runs under jsdom but is kept out of `npm test` on purpose: it is a
 * measurement, not an assertion.
 */
export default defineConfig({
	test: {
		include: ['dev/bench/**/*.bench.ts'],
		environment: 'jsdom',
		restoreMocks: true,
	},
})
