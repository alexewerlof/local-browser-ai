# `src/options` — agent guide

The Settings page: a rail of sections, each built from `SettingsCard` + `.field` rows. The page is referred to as
**Settings** everywhere it is visible; `options` survives only in paths (`options.html`, `options_ui`, this directory).

Vocabulary for this area lives in `ontology.yml` under `settings` (settings, settings-section, settings-card,
settings-field, switch) plus the setting entries in their domain groups: `context`, `memory`, `models`, `tools`,
`skills`, `errors`.

Local rules:

- Rail order is fixed: General, Providers, Models, Skills, Built-in Tools, MCP, Memory, Context. General is the landing
  section. A new section is a new rail item and a new ontology entry for each card title it adds.
- Card title is sentence case (`Built-in tools`, `MCP servers`, `Memory settings`); the rail label alone is title case
  (`Built-in Tools`).
- One control per `.field`, label first, hint second. Reuse `Switch`, `RangeField` and `SelectField` from `fields.tsx`
  rather than new controls.
- Card titles and control labels are quoted verbatim in the ontology. Never invent a second word for a setting that
  already has an entry.
- `ToolsSection.tsx` is dead code superseded by `BuiltInToolsSection.tsx`; do not extend it.

See `../AGENTS.md` for architecture and `../../ontology.yml` for names.
