# `src/settings` — agent guide

The Settings page: a rail of sections, each built from `SettingsCard` + `.field` rows. The page is called **Settings**
everywhere — UI, docs and code alike (`settings.html`, this directory, `SettingsApp`, `openSettings`). The only survivor
of the old name is Chrome's manifest key `options_ui`, which the platform defines and nothing can rename.

Vocabulary for this area lives in `ontology.yml` under `settings` (settings, settings-section, settings-card,
settings-field, switch) plus the setting entries in their domain groups: `context`, `memory`, `models`, `tools`,
`skills`, `errors`.

Local rules:

- Rail order is fixed: General, Providers, Models, Skills, Built-in Tools, MCP, Memory, Context. General is the landing
  section. A new section is a new rail item and a new ontology entry for each card title it adds. The order lives in
  `SETTINGS_SECTIONS` (`src/core/settings-routes.ts`); the rail renders it and `SECTION_ICONS` maps each id to its icon.
- The open section is the URL fragment, Chrome-style: General is the root and every other section is `#/<id>`
  (`settings.html#/skills`). A path segment is impossible (the page is a static file), so the slash lives in the
  fragment. The page reads the fragment on mount, normalises an unknown or hand-typed one with `replaceState`, syncs on
  `hashchange`/`popstate` (Back and Forward work) and pushes a new entry per rail click. `openSettings(section)` in
  `src/platform/chrome.ts` opens Settings at that fragment: it focuses the window, then activates the one Settings tab
  and moves it to the section (`tabs.update`), creating the tab only when none is open. That reuse is why the manifest
  requests `tabs`; never open a second Settings tab.
- A menu that points at a section uses `SettingsButton` (icon-only gear, `title` + `aria-label` such as "Manage
  skills"), not a sentence. The Tools menu carries one gear per group: built-in tools and MCP.
- Card title is sentence case (`Built-in tools`, `MCP servers`, `Memory settings`); the rail label alone is title case
  (`Built-in Tools`).
- One control per `.field`, label first, hint second. Reuse `Switch`, `RangeField` and `SelectField` from `fields.tsx`
  rather than new controls.
- Card titles and control labels are quoted verbatim in the ontology. Never invent a second word for a setting that
  already has an entry.

See `../AGENTS.md` for architecture and `../../ontology.yml` for names.
