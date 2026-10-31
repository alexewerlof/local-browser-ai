import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
	root,
	base: './',
	plugins: [react()],
	build: {
		outDir: 'dist',
		// The dist directory is a document-portal grant for Flatpak browsers: never
		// delete the directory itself, only its contents (handled in scripts/build.js).
		emptyOutDir: false,
		target: 'es2022',
		sourcemap: true,
		minify: true,
		rollupOptions: {
			input: {
				'side-panel': fileURLToPath(new URL('side-panel.html', import.meta.url)),
				options: fileURLToPath(new URL('options.html', import.meta.url)),
			},
			output: {
				entryFileNames: 'assets/[name]-[hash].js',
				chunkFileNames: 'assets/[name]-[hash].js',
				assetFileNames: 'assets/[name]-[hash][extname]',
			},
		},
	},
})
