/**
 * ESLint owns correctness; Prettier owns formatting (`npm run fmt`).
 *
 * The rule set is deliberately small: the JavaScript and TypeScript recommended
 * presets, the two core React hook rules, and the two type-aware promise rules that
 * `tsc` cannot catch. `eslint-config-prettier` comes last so no rule ever argues with
 * the formatter — anything about layout belongs in `.prettierrc.json`, not here.
 */
import js from '@eslint/js'
import prettier from 'eslint-config-prettier/flat'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
	// Build output, browser profiles and the vendored agent skills are not repo code.
	globalIgnores(['dist/', 'dev/e2e/artifacts/', 'dev/e2e/.profile*/', '.agents/']),

	js.configs.recommended,
	// Extends `js.configs.recommended` for TS: turns off the checks `tsc` already owns.
	...tseslint.configs.recommended,

	{
		// Node-side tooling: build/package scripts and the benchmark.
		files: ['scripts/**/*.js', 'dev/bench/**/*.ts', '*.config.js', '*.config.ts'],
		languageOptions: { globals: globals.node },
	},

	{
		// The e2e harness runs in two realms: the scenario body is Node, but every
		// `page.evaluate()` callback is serialized into the page, where the DOM and the
		// stubbed `chrome.*` surface exist. Declaring both here beats a `no-undef`
		// disable on each of the ~120 callbacks spread across the scenarios.
		files: ['dev/e2e/**/*.mjs'],
		languageOptions: { globals: { ...globals.node, ...globals.browser, chrome: 'readonly' } },
	},

	{
		rules: {
			// Fallbacks are deliberately silent here (`catch {}` after a storage or parse
			// failure the caller already reports). The code comment says why; making the
			// rule complain would only push people to write logging they do not want.
			'no-empty': ['error', { allowEmptyCatch: true }],
			// `_`-prefixed bindings are intentional: unused destructured rest, ignored args.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
			],
		},
	},

	{
		// Hooks live in `.ts` files too (`src/app/useStore.ts`), so this is not jsx-only.
		// Only the two core rules are on: the React Compiler preset is a separate decision.
		files: ['src/**/*.ts', 'src/**/*.tsx'],
		plugins: { 'react-hooks': reactHooks },
		rules: {
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'warn',
		},
	},

	{
		// Type-aware rules only where a tsconfig project exists: `src/` and the root
		// config files `tsconfig.json` includes. `dev/` and `scripts/` stay syntax-only,
		// which keeps the run fast and needs no second tsconfig.
		files: ['src/**/*.ts', 'src/**/*.tsx', 'vite.config.ts'],
		languageOptions: {
			parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
		},
		rules: {
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
		},
	},

	prettier,
)
