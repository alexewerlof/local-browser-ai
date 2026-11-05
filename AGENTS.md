# Local Browser AI — agent guide

A Chrome/Edge (MV3) side-panel chat harness. The extension is provider-agnostic: the model can be the browser's built-in
Prompt API, a local server (llama.cpp, Ollama, LM Studio, vLLM), or a hosted API (OpenAI, Anthropic, DeepSeek). A domain
layer owns conversations, the context budget, compaction, skills and built-in tools; providers are swappable adapters
over the [Vercel AI SDK](https://ai-sdk.dev).

## Architecture

| Layer       | Location           | Responsibility                                                                               |
| ----------- | ------------------ | -------------------------------------------------------------------------------------------- |
| UI          | `src/app/`         | React side panel: transcript, composer, model/thinking pickers, context meter, history.      |
| Settings UI | `src/settings/`    | Full-page providers, models, skills, built-in tools, MCP, memory, context and general.       |
| Domain      | `src/core/`        | Types, settings schema, token budget, page-context assembly, BM25, memory, compaction.       |
| Providers   | `src/providers/`   | AI SDK adapters, model catalog (context windows/capabilities), discovery, error mapping.     |
| MCP         | `src/state/mcp.ts` | Streamable HTTP client, tool discovery cache, approval-wrapped MCP tools.                    |
| Browser     | `src/browser/`     | Service worker, typed RPC, injectable extraction, HTML→markdown, built-in tools.             |
| State       | `src/state/`       | Settings, conversation, run state, prompt queue, memory, IndexedDB persistence, attachments. |
| Platform    | `src/platform/`    | `chrome.*` availability, storage abstraction, host permissions.                              |

Entry points: `side-panel.html` + `src/app/main.tsx`, `settings.html` + `src/settings/main.tsx`, and the service worker
`src/browser/background.ts` (built separately to keep React and the AI SDK out of it).

## Ontology

`ontology.yml` (repo root) is the naming contract: one term per concept, grouped hierarchically, with the code
identifiers, the exact UI strings and the words that are wrong for it. Read it before naming anything, and add an entry
in the same change that adds a concept, control or pipeline stage. It is development-only and never shipped.

The five terms that get confused most:

- **Conversation** is the stored chat (code); **Chat** is the same thing as the user sees it (UI). Never "session".
- **Turn** is one prompt plus its answer. **Run** is one execution of the agent. **Step** is one model call plus the
  tool calls it requested. Never "round".
- **Context** is the assembled prompt, **page attachment** is the page, **context window** is the capacity. Never
  "context" alone for either of the latter two.
- **Built-in tool** (in `src/browser/tools.ts`) vs **MCP tool** (remote). Never "browser tool".
- **Settings** is the UI and the docs, and the code too: `settings.html`, `src/settings`, `openSettings`. The one
  exception is Chrome's own manifest key `options_ui`, which cannot be renamed; note that `chrome://extensions` labels
  the entry "Extension options" from that key.

Area files narrow this down: `src/app/AGENTS.md`, `src/core/AGENTS.md`, `src/browser/AGENTS.md`,
`src/settings/AGENTS.md`.

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

## Prompt queue

The composer stays usable while a run streams: submitting during a run appends to a per-conversation FIFO queue shown
above the input, and the run loop starts the next prompt when it goes idle (completion or error). Both buttons are
visible while streaming — Stop aborts the current answer, Submit queues the next prompt.

**Stop parks the queue.** The user pressed Stop to get out of the loop, not to skip this answer and run everything else,
so `stopGeneration` sets `queuePausedStore` (only when something is queued) and `runTurn`'s `finally` skips the drain. A
Continue button (Lucide `Play`, `aria-label="Continue"`) appears next to Submit while the queue is paused;
`resumeQueue()` clears the flag and drains. Any explicit submit, `newChat` and `openConversation` also clear it, so a
new prompt or a freshly opened chat never inherits an old pause. The pause is in-memory only: a reloaded panel resumes
the queue (that is what `21-queue-persist` asserts).

`src/state/queue.ts` owns `queueStore` (only ever the queue of the conversation on screen) and `src/state/database.ts`
holds it in the `queues` object store keyed by conversation id (DB v2). The queue is **not** a field on `Conversation`:
`runTurn` commits a working copy for every token, so a removal made mid-run would be overwritten. Writes are serialized
through one chain and persisted **before** they are published, so a visible row is already durable and a reload cannot
lose it. `startTurn` also saves the conversation immediately instead of on the 400 ms debounce, so a reload mid-stream
keeps the chat (and its queue) rather than orphaning the queue; `loadConversation` marks a leftover `streaming` message
`aborted` so a reopened chat has no permanent typing indicator.

`chat.ts` owns draining. `submitPrompt` enqueues when `runStore` is not idle, `runTurn`'s `finally` and `compactNow`
call `drainQueue`, and three flags keep it single-owner: `draining` (a nested turn must not drain again),
`switchingConversation` (set across `openConversation`, so an aborted run cannot drain one chat's queue into another; a
prompt taken in that window is handed back with `restorePromptFront`) and `queuePausedStore`. A prompt leaves the queue
before its turn starts, so a failing answer cannot replay the same entry forever. Removing a queued prompt **replaces**
the draft and restores its skill, so the text stays editable instead of being thrown away.

## Rendering

Assistant output is rendered by **Streamdown** (`src/app/components/Markdown.tsx`), not by a hand-rolled markdown-it
pipeline. It handles unterminated markdown while streaming, GFM, and the copy buttons; a wrapper component with
`dangerouslySetInnerHTML` used to do that job and is gone. `markdown-it` remains only in
`src/browser/extract/sections.ts`, which splits page markdown into sections — do not remove that dependency.

Streamdown ships **no compiled CSS**: it emits Tailwind utility classes and expects the app to provide them.
`src/app/tailwind.css` imports only Tailwind's theme and utilities layers (no Preflight — `base.css` already normalises
the panel), `@source`-scans `streamdown/dist` and the plugin dists so the classes are actually generated, maps the
shadcn-style `--color-*` tokens onto `tokens.css`, and defines a `dark` variant that follows both `prefers-color-scheme`
and the explicit `data-theme` override. It must be imported before `tokens.css`: Tailwind's theme layer defines the same
`--radius-*`/`--text-*` properties, and the unlayered app tokens winning the cascade is what keeps
`rounded-md`/`text-sm` on the panel's 8px/12px scale. `vite.sw.config.ts` has no Tailwind and must stay that way.

Two parts are opt-in because each is a large chunk (`settings.rendering`, added in v7): `math` renders `$$…$$` with
KaTeX and defaults **on**, `codeHighlighting` uses Shiki and defaults **off**. `useMarkdownPlugins.ts` imports both
lazily and caches the plugin objects in module scope; a failed fetch is forgotten so a later message retries, and the
text falls back to literal markup meanwhile. Streamdown's default is `$$`-only — single-`$` inline math is off on
purpose, because it fights currency amounts.

Security stays as before: `rehypePlugins` is passed explicitly as `[sanitize, harden]` **without `rehype-raw`**, which
makes Streamdown emit raw HTML from the model as text (it installs a visitor that turns leftover raw nodes into text
nodes). Do not add `rehype-raw`. Passing `rehypePlugins` replaces the whole default array, so build on
`defaultRehypePlugins` instead of re-listing the plugins. `linkSafety` is disabled (the panel has no room for the
confirmation modal) and `controls` keeps only the code copy button.

## Non-negotiables

- **The side panel is the only place that talks to a model.** The service worker only extracts pages, opens tabs and
  reports tab lifecycle. All model calls happen in the panel through `src/state/chat.ts`.
- **Providers are adapters.** Nothing outside `src/providers/` may branch on `ProviderKind` for model behaviour. Add a
  provider by extending the registry, catalog and settings presets.
- **The AI SDK does not know context windows.** Window sizes come from `src/providers/catalog.ts` plus per-provider
  overrides; provider-reported usage is the source of truth once a request completes.
- **Tab access is `activeTab`.** `chrome.action.onClicked` opens the panel and remembers the tab; the panel claims it
  and extracts. Navigating or switching tabs revokes access, so the attachment is marked stale. Do not add install-time
  host permissions for page content. The `tabs` permission is requested only for tab _URLs_ — `openSettings` uses them
  to find the open Settings tab — and it grants no page content.- **Never set `openPanelOnActionClick: true`.** Chrome
  persists that flag per profile, and while it is set the browser handles the toolbar click itself and **does not fire
  `action.onClicked`**, so nothing gets attached and nothing logs. The worker resets the flag on every start; keep it
  that way. Likewise, `sidePanel.open()` must be the first call in a gesture handler — never `await` before it, or the
  gesture is lost.- **Extraction runs in the page.** `src/browser/extract/inject.ts` must stay self-contained (no
  imports, no module helpers) because `chrome.scripting.executeScript({ func })` serializes it.
- **Page content is untrusted input.** It is wrapped with an explicit instruction to ignore embedded instructions, and
  model output is never executed as code. Markdown renders through Streamdown with `rehype-raw` deliberately omitted, so
  tags in an answer stay inert text.
- **Memory is data, not instructions.** Saved memories are rendered under `## Memory` with an explicit note saying so,
  and the tools forbid saving page or tool output as a memory. Only the user can make a memory always-on; the tools
  accept `auto` and `tool` only.
- **MCP servers are HTTP-only and live in the panel.** `@ai-sdk/mcp` is imported only by `src/state/mcp.ts`; the service
  worker must stay free of it (no process to spawn, so stdio servers cannot be supported). MCP has its own settings
  section (`src/settings/McpSection.tsx`), separate from Built-in Tools. Each turn connects fresh, lists tools, and
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
- **`.packageignore` decides what ships.** `npm run package` packs `dist/` with `glob(…, { exclude })`, filtering by the
  patterns in `.packageignore` (`.gitignore`-shaped: `#` comments, blank lines, and a pattern without a `/` matching at
  any depth). The build copies only `public/`, so dev docs never reach `dist/` on their own — the file is the guard
  against a stray copy. It is read strictly: a missing file fails the package step rather than shipping everything.

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
`{ settings, tab, extraction, selection, storage }`. MCP tools use `dev/e2e/mock-mcp-server.mjs`, a stateless MCP server
on a random port; never point a scenario at a real or fixed endpoint.

`npm run e2e:ext` additionally exercises what the shim cannot: the real service worker, the injectable extractor against
a localhost fixture page (localhost is in `host_permissions`, so no `activeTab` grant is needed) and the panel-behavior
migration.

## Conventions

- Names come from `ontology.yml`; a new concept, control or pipeline stage gets an entry there in the same change.
- TypeScript strict, `verbatimModuleSyntax`; React 19 function components; no state library — plain `Store` +
  `useSyncExternalStore` (`src/core/store.ts`, `src/app/useStore.ts`).
- Icons come from `lucide-react`, imported as components at the call site (`import { Settings } from 'lucide-react'`).
  No icon registry or wrapper — Lucide is tree-shaken, defaults to stroke width 2 and adds `aria-hidden` unless the
  element carries `aria-*`/`title`/`role`.
- CSS is plain and token-based (`src/styles/tokens.css`), compact and panel-first. Components use BEM-ish classes.
  Tailwind is present only to style Streamdown (see the rendering section below); app CSS stays unlayered so it wins
  over Tailwind's utilities layer.
- Formatting: tabs, single quotes, no semicolons (Prettier via `npm run fmt`).
- Settings sections are hash-routed (`settings.html#/skills`; General is the root `#/`). `SETTINGS_SECTIONS` in
  `src/core/settings-routes.ts` is the order, and `openSettings(section)` opens Settings at a section. Settings is a
  **single tab**: the function queries open tabs (hence the `tabs` permission), focuses the window, and moves the
  existing tab to the section instead of opening another one; with no section it keeps the section already on screen. A
  menu that points at Settings uses the `SettingsButton` gear rather than a sentence. Paths cannot carry the section —
  the page is a static extension file — so the slash has to live in the fragment.
- Appearance lives in `settings.ui` and is applied to `<html>` by `applyAppearance` in `src/state/settings.ts`, next to
  the theme attribute. Text size is one of Chrome's five labels (`very-small` … `very-large`) mapped to
  `FONT_SIZE_SCALES` in `src/core/settings.ts` and written as the `--text-scale` token, which multiplies the `--text-*`
  scale in `tokens.css`. `medium` renders exactly the designed pixels, and nothing but type scales — controls use
  `min-height`, so they only grow when the text needs it.
- Settings are versioned and validated with zod; `normalizeSettings` re-adds the built-in provider and skills so a
  corrupted store cannot brick the panel. Tool settings carry `enabled`/`autoApprove` for built-ins and `mcp` for remote
  servers; a malformed MCP entry is dropped on its own instead of resetting the document.
- Adding a default-on tool means three edits in `src/core/settings.ts`: the id list (`READ_ONLY_TOOL_IDS` /
  `ACTION_TOOL_IDS`), a `TOOLS_ADDED_IN` entry with the version it shipped in (add an `autoApprove` list when only some
  of those ids should run without asking), and a `SETTINGS_VERSION` bump. Existing stores only receive the id when their
  version is below that entry, which is what keeps a later user toggle from being undone on every load.
- Icons: `MemoryStick` is memory everywhere (Settings rail, memory tool cards, the panel's save action).
- The composer has a top bar inside the box border (`.composer__topbar`), empty for now and reserved for per-prompt
  context. Its right side holds the Expand/Shrink toggle (`PanelBottomOpen`/`PanelBottomClose`): `.composer--expanded`
  sizes the whole composer to 75% of the panel so a sliver of transcript stays visible, and the textarea then scrolls
  internally instead of growing. Expanded is in-memory only — never a settings field — and normal mode keeps the
  40–240px auto-grow.
- Errors are `AppError` with a machine-readable kind (`src/providers/errors.ts`); never surface raw provider text only.
- Persist before you publish: the prompt queue writes to IndexedDB first and only then updates `queueStore`, so a row on
  screen is always durable. `startTurn` writes the conversation immediately for the same reason — a reload mid-stream
  must not lose the chat the queue belongs to.
- Keep modules small and co-located; a file that mixes UI and domain logic is a smell.
