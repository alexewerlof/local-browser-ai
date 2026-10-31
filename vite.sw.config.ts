import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

/**
 * The MV3 service worker is built on its own so it stays small (no React, no AI SDK)
 * and is emitted as a single ESM file that `manifest.background.service_worker` can point at.
 */
export default defineConfig({
	root,
	build: {
		outDir: 'dist',
		emptyOutDir: false,
		target: 'es2022',
		sourcemap: true,
		minify: true,
		lib: {
			entry: fileURLToPath(new URL('src/browser/background.ts', import.meta.url)),
			formats: ['es'],
			fileName: () => 'background.js',
		},
		rollupOptions: {
			output: {
				inlineDynamicImports: true,
			},
		},
	},
})
