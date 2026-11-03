# Local Browser AI — agent guide

A Chrome/Edge (MV3) side-panel chat harness. The extension is provider-agnostic: the model can be the browser's built-in
Prompt API, a local server (llama.cpp, Ollama, LM Studio, vLLM), or a hosted API (OpenAI, Anthropic, DeepSeek). A domain
layer owns conversations, the context budget, compaction, skills and browser tools; providers are swappable adapters
over the [Vercel AI SDK](https://ai-sdk.dev).

## Architecture

| Layer       | Location           | Responsibility                                                                           |
| ----------- | ------------------ | ---------------------------------------------------------------------------------------- |
| UI          | `src/app/`         | React side panel: transcript, composer, model/thinking pickers, context meter, history.  |
| Settings UI | `src/options/`     | Full-page providers, models, skills, built-in tools, MCP, memory, context and general.   |
| Domain      | `src/core/`        | Types, settings schema, token budget, page-context assembly, BM25, memory, compaction.   |
| Providers   | `src/providers/`   | AI SDK adapters, model catalog (context windows/capabilities), discovery, error mapping. |
| MCP         | `src/state/mcp.ts` | Streamable HTTP client, tool discovery cache, approval-wrapped remote tools.             |
| Browser     | `src/browser/`     | Service worker, typed RPC, injectable extraction, HTML→markdown, browser tools.          |
| State       | `src/state/`       | Settings, conversation, run state, memory, IndexedDB persistence, attachment plumbing.   |
| Platform    | `src/platform/`    | `chrome.*` availability, storage abstraction, host permissions.                          |

Entry points: `side-panel.html` + `src/app/main.tsx`, `options.html` + `src/options/main.tsx`, and the service worker
`src/browser/background.ts` (built separately to keep React and the AI SDK out of it).

## Page context

Extraction happens in the page (`src/browser/extract/inject.ts`) and returns three things: cleaned HTML, the page's own
text, and an accessibility skeleton (roles, names, states) built from the live DOM. `pipeline.ts` picks a representation
— Readability for articles, the skeleton for control-heavy app shells, plain text as a last resort — and
`PageAttachment.representation` records which one won.

The prompt does **not** get the page by default. `core/context/page-index.ts` renders a few hundred tokens of index
(outline with section ids and sizes, likely sections, a short opening) and the model pulls sections through
`read_page_section` / `find_in_page`. `choosePageMode` in `core/context/assembly.ts` owns that decision: whole page only
when it is under ~400 tokens, when the strategy says so, or when the model has no page tools (then outline + excerpts).
`npm run bench` prints the tokens each representation costs on four page shapes — run it before changing extraction.

## Memory

Flat, global notes that survive across chats. `src/core/memory.ts` is the pure domain (schemas, normalization,
selection, recall, export/import); `src/state/memory.ts` owns `memory.v1` in `chrome.storage.local` and serializes every
write through one chain so two tool calls in a turn cannot clobber each other. It is deliberately **not** a settings
subtree: settings are rewritten on a 250 ms debounce per keystroke.

Three modes decide injection. `always` goes in every turn, `auto` only when the last user message matches it (BM25 via
`core/context/lexical.ts`, capped by `memory.autoLimit`), and `tool` is passive until the model calls `recall`. The
block is a `ContextPart` with id `memory`, appended after the language note, and clipped to `memory.injectShare` of the
usable window (128–1500 tokens, never more than 30%). Compaction cannot shrink it, so an unbounded block would leave the
chat permanently over the threshold.

Two tools, both panel-side: `remember` (create, or update by `id`) and `recall` (query optional = newest first). Creates
are auto-approved; **updates call `requestApproval`** unless `remember` is in `tools.autoApprove`. Deletion is user-only
in Settings, as a tombstone with an 8-second undo. The model may only save `auto` or `tool` — promoting to `always` is
the user's decision, so untrusted page or tool content can never persist an always-on block. Memory text is data, never
instructions; the rendered block says so.

Settings live in `settings.memory` (`enabled`, `injectShare`, `autoLimit`), version 6. Turning memory off removes both
tools through `enabledBuiltInTools` and skips injection, but keeps the items. Sync is deferred: records carry
`updatedAt`, `deletedAt` and `scope`, and export/import (newest `updatedAt` wins, a tombstone wins a tie) is the v1
bridge, so a `chrome.storage.sync` backend can be added without migrating data.

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
- **Memory is data, not instructions.** Saved memories are rendered under `## Memory` with an explicit note saying so,
  and the tools forbid saving page or tool output as a memory. Only the user can make a memory always-on; the tools
  accept `auto` and `tool` only.
- **MCP servers are HTTP-only and live in the panel.** `@ai-sdk/mcp` is imported only by `src/state/mcp.ts`; the service
  worker must stay free of it (no process to spawn, so stdio servers cannot be supported). MCP has its own settings
  section (`src/options/McpSection.tsx`), separate from Built-in Tools. Each turn connects fresh, lists tools, and
  closes every client when the run ends. A server that is down is a dismissible warning, never a failed turn. Tools are
  namespaced (`mcp_<server>_<tool>`), clipped to `MAX_TOOL_CHARS`, and their output is treated as untrusted data — it
  never becomes instructions. Do not commit a real endpoint or use a live server in tests; use
  `dev/e2e/mock-mcp-server.mjs`. Pass an explicit `fetch` wrapper to the transport: browsers reject a `fetch` whose
  receiver is not the global scope ("Illegal invocation").
- **A server that rejects browser origins is handled in the browser, not the header.** Many MCP servers answer 403 to
  any request carrying `Origin` (DNS-rebinding protection), and `Origin` is a forbidden header no script can drop. A
  server with `stripOrigin: true` gets a session-scoped `declarativeNetRequest` rule (`src/platform/net-rules.ts`,
  permission `declarativeNetRequestWithHostAccess`) that removes the header for that endpoint only. Rules are rebuilt
  from settings on every load, so nothing lingers; `syncOriginStripping` returns false outside an extension, where the
  web harness runs.
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
`{ settings, tab, extraction, selection, storage }`. Remote tools use `dev/e2e/mock-mcp-server.mjs`, a stateless MCP
server on a random port; never point a scenario at a real or fixed endpoint.

`npm run e2e:ext` additionally exercises what the shim cannot: the real service worker, the injectable extractor against
a localhost fixture page (localhost is in `host_permissions`, so no `activeTab` grant is needed) and the panel-behavior
migration.

## Conventions

- TypeScript strict, `verbatimModuleSyntax`; React 19 function components; no state library — plain `Store` +
  `useSyncExternalStore` (`src/core/store.ts`, `src/app/useStore.ts`).
- Icons come from `lucide-react`, imported as components at the call site (`import { Settings } from 'lucide-react'`).
  No icon registry or wrapper — Lucide is tree-shaken, defaults to stroke width 2 and adds `aria-hidden` unless the
  element carries `aria-*`/`title`/`role`.
- CSS is plain and token-based (`src/styles/tokens.css`), compact and panel-first. Components use BEM-ish classes.
- Formatting: tabs, single quotes, no semicolons (Prettier via `npm run fmt`).
- Settings are versioned and validated with zod; `normalizeSettings` re-adds the built-in provider and skills so a
  corrupted store cannot brick the panel. Tool settings carry `enabled`/`autoApprove` for built-ins and `mcp` for remote
  servers; a malformed MCP entry is dropped on its own instead of resetting the document.
- Adding a default-on tool means three edits in `src/core/settings.ts`: the id list (`READ_ONLY_TOOL_IDS` /
  `ACTION_TOOL_IDS`), a `TOOLS_ADDED_IN` entry with the version it shipped in (add an `autoApprove` list when only some
  of those ids should run without asking), and a `SETTINGS_VERSION` bump. Existing stores only receive the id when their
  version is below that entry, which is what keeps a later user toggle from being undone on every load.
- Icons: `MemoryStick` is memory everywhere (options nav, memory tool cards, the panel's save action).
- Errors are `AppError` with a machine-readable kind (`src/providers/errors.ts`); never surface raw provider text only.
- Keep modules small and co-located; a file that mixes UI and domain logic is a smell.
