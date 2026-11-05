# `src/core` — agent guide

Pure domain: types, settings schema, token budget, context assembly, compaction, BM25, memory, MCP helpers. No
`chrome.*`, no React.

Vocabulary for this area lives in `ontology.yml` under `harness` (conversation, turn, run, step, answer, prompt),
`context`, `page`, `memory`, `models`, `tools`, `skills`, `errors` and `settings`. Add the term there before adding the
type here.

Local rules:

- Types are the concept in PascalCase (`Conversation`, `ContextPart`, `MemoryItem`); ids and enum values are kebab-case
  or lowercase (`page-context-strategy` docs-side, `openai-compatible` in code).
- `context` is the assembled prompt, `page` is the page attachment, `contextWindow` is the capacity. Never a bare
  `context` for the latter two.
- `PageContextMode` (runtime, 5 values) and `PageContextStrategy` (setting, 4 values) are different closed sets.
- Settings are versioned; a new default-on field needs a `SETTINGS_VERSION` bump and, for tools, a `TOOLS_ADDED_IN` row.
- `src/providers/catalog.ts` is the model catalog; `McpCatalogEntry` is the MCP catalog. Always qualify "catalog".

See `../AGENTS.md` for architecture and `../../ontology.yml` for names.
