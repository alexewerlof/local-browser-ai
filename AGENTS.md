# Local Browser AI — agent guide

A Chrome/Edge (MV3) side-panel chat harness. The extension is provider-agnostic: the model can be the browser's built-in
Prompt API, a local server (llama.cpp, Ollama, LM Studio, vLLM), or a hosted API (OpenAI, Anthropic, DeepSeek). A domain
layer owns conversations, the context budget, compaction, skills and browser tools; providers are swappable adapters
over the [Vercel AI SDK](https://ai-sdk.dev).

## Architecture

| Layer       | Location         | Responsibility                                                                           |
| ----------- | ---------------- | ---------------------------------------------------------------------------------------- |
| UI          | `src/app/`       | React side panel: transcript, composer, model/thinking pickers, context meter, history.  |
| Settings UI | `src/options/`   | Full-page provider/model/skill/tool/context management.                                  |
| Domain      | `src/core/`      | Types, settings schema, token budget, page-context assembly, BM25, compaction, stores.   |
| Providers   | `src/providers/` | AI SDK adapters, model catalog (context windows/capabilities), discovery, error mapping. |
| Browser     | `src/browser/`   | Service worker, typed RPC, injectable extraction, HTML→markdown, browser tools.          |
| State       | `src/state/`     | Settings, conversation, run state, IndexedDB persistence, attachment plumbing.           |
| Platform    | `src/platform/`  | `chrome.*` availability, storage abstraction, host permissions.                          |

Entry points: `side-panel.html` + `src/app/main.tsx`, `options.html` + `src/options/main.tsx`, and the service worker
`src/browser/background.ts` (built separately to keep React and the AI SDK out of it).

## Non-negotiables

- **The side panel is the only place that talks to a model.** The service worker only extracts pages, opens tabs and
  reports tab lifecycle. All model calls happen in the panel through `src/state/chat.ts`.
- **Providers are adapters.** Nothing outside `src/providers/` may branch on `ProviderKind` for model behaviour. Add a
  provider by extending the registry, catalog and settings presets.
- **The AI SDK does not know context windows.** Window sizes come from `src/providers/catalog.ts` plus per-provider
  overrides; provider-reported usage is the source of truth once a request completes.
- **Tab access is `activeTab`.** `chrome.action.onClicked` opens the panel and remembers the tab; the panel claims it
  and extracts. Navigating or switching tabs revokes access, so the attachment is marked stale. Do not add install-time
  host permissions for page content.- **Never set `openPanelOnActionClick: true`.** Chrome persists that flag per
  profile, and while it is set the browser handles the toolbar click itself and **does not fire `action.onClicked`**, so
  nothing gets attached and nothing logs. The worker resets the flag on every start; keep it that way. Likewise,
  `sidePanel.open()` must be the first call in a gesture handler — never `await` before it, or the gesture is lost.-
  **Extraction runs in the page.** `src/browser/extract/inject.ts` must stay self-contained (no imports, no module
  helpers) because `chrome.scripting.executeScript({ func })` serializes it.
- **Page content is untrusted input.** It is wrapped with an explicit instruction to ignore embedded instructions, and
  model output is never executed as code. Markdown is rendered with `html: false`.
- **Do not delete `dist/` itself.** Flatpak browsers receive it through the document portal, which grants the directory
  inode. `scripts/build.js` empties its contents and Vite runs with `emptyOutDir: false`.

## Commands

| Task                   | Command                                  |
| ---------------------- | ---------------------------------------- |
| Build                  | `npm run build`                          |
| Watch                  | `npm run dev`                            |
| Serve the panel as web | `npm run serve` → http://localhost:4173/ |
| Browser scenarios      | `npm run e2e`                            |
| Extension smoke test   | `npm run e2e:ext`                        |
| Unit tests             | `npm test` (`vitest run`)                |
| Typecheck              | `npm run typecheck`                      |
| Format                 | `npm run fmt`                            |
| Package zip            | `npm run package`                        |

The harness serves `dist/` as an ordinary web page and injects `dev/e2e/chrome-shim.mjs`. Scenarios live in
`dev/e2e/scenarios/` and use `dev/e2e/fake-server.mjs` (an OpenAI-compatible SSE server that records request bodies and
can emit tool calls). Add a scenario by creating `NN-name.mjs` exporting `run(ctx)`; config is
`{ settings, tab, extraction, selection, storage }`.

`npm run e2e:ext` additionally exercises what the shim cannot: the real service worker, the injectable extractor against
a localhost fixture page (localhost is in `host_permissions`, so no `activeTab` grant is needed) and the panel-behavior
migration.

## Conventions

- TypeScript strict, `verbatimModuleSyntax`; React 19 function components; no state library — plain `Store` +
  `useSyncExternalStore` (`src/core/store.ts`, `src/app/useStore.ts`).
- CSS is plain and token-based (`src/styles/tokens.css`), compact and panel-first. Components use BEM-ish classes.
- Formatting: tabs, single quotes, no semicolons (Prettier via `npm run fmt`).
- Settings are versioned and validated with zod; `normalizeSettings` re-adds the built-in provider and skills so a
  corrupted store cannot brick the panel.
- Errors are `AppError` with a machine-readable kind (`src/providers/errors.ts`); never surface raw provider text only.
- Keep modules small and co-located; a file that mixes UI and domain logic is a smell.
