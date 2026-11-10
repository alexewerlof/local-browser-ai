# `src/core` — agent guide

Pure domain: types, settings schema, token budget, context assembly, compaction, BM25, memory, MCP helpers. No
`chrome.*`, no React.

Vocabulary for this area lives in `ontology.yml` under `harness` (conversation, turn, run, step, answer, prompt),
`context`, `page`, `memory`, `models`, `tools`, `skills`, `errors` and `settings`. Add the term there before adding the
type here.

Local rules:

- Types are the concept in PascalCase (`Conversation`, `ContextPart`, `MemoryItem`); ids and enum values are kebab-case
  or lowercase (`page-handle` docs-side, `openai-compatible` in code).
- `context` is the assembled prompt, `page` is a page the user added, `contextWindow` is the capacity. Never a bare
  `context` for the latter two.
- `PageSnapshot` is stored (handle, frozen `block`, sections); `CapturedPage` is what extraction returns before the page
  joins a chat. Only `page-block.ts` turns one into the other, and it does so once — see `freezePage`.
- `ContextPart.id` is a closed union shared with the meter; a page block is counted by the `page` part, not by
  `history`.
- Settings are versioned; a new default-on field needs a `SETTINGS_VERSION` bump and, for tools, a `TOOLS_ADDED_IN` row.
  A removed **value** (a thinking level, a stored provider kind) needs a migration that drops the stale entries and a
  `sanitize*` pass in `normalizeSettings`, because the schema is closed: one unparseable entry would otherwise reset the
  whole document, providers and keys included.
- `tool-selection.ts` is the one place that decides what "on" means for a tool set (the built-in set or one MCP server):
  the tri-state for a group, the writes behind a checkbox, and which MCP tool skips approval. The composer tree and
  Settings → Tools both call it; a new rule belongs here, not in a component. It may take tool **names**, never a
  catalog entry — this layer does not know about discovery.
- `src/providers/catalog.ts` is the model catalog; `McpCatalogEntry` is the MCP catalog. Always qualify "catalog".

See `../AGENTS.md` for architecture and `../../ontology.yml` for names.
