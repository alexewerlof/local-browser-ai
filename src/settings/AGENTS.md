# `src/settings` — agent guide

The Settings page: a rail of sections, each built from `SettingsCard` + `.field` rows. The page is called **Settings**
everywhere — UI, docs and code alike (`settings.html`, this directory, `SettingsApp`, `openSettings`). The only survivor
of the old name is Chrome's manifest key `options_ui`, which the platform defines and nothing can rename.

Vocabulary for this area lives in `ontology.yml` under `settings` (settings, settings-section, settings-card,
settings-field, switch, checkbox) plus the setting entries in their domain groups: `context`, `memory`, `models`,
`tools` (tool-set, auto-approve), `prompt-templates`, `errors`.

Local rules:

- Providers is one kind of endpoint: a local OpenAI-compatible server. "Add provider" opens the editor directly (there
  is no preset chooser), the editor's Base URL asks for the host grant on save, and every configured provider can be
  removed. A store with no provider is normal — the panel then shows "No model is configured yet" and points here.
- Rail order is fixed: General, Appearance, Model Providers, Templates, Tools, Memory, Context. General is the landing
  section. A new section is a new rail item and a new ontology entry for each card title it adds. The order lives in
  `SETTINGS_SECTIONS` (`src/core/settings-routes.ts`); the rail renders it and `SECTION_ICONS` maps each id to its icon.
  There is deliberately **no Models section**: the model list, its facts and its reasoning select all live in the
  provider editor, and the old `#models` fragment is an alias onto `#providers`. The Templates page was called
  **Skills**, then **Prompt templates**, so `#skills` and `#prompt-templates` are aliases onto `#templates`.
- Ownership follows the domain, not the page a card happened to start on. General keeps the tool-step cap, Data and
  About; Appearance owns everything about how the app looks and renders (theme, submit key, font size, Math, Code
  highlighting); Context owns the system prompt and compaction, because both are what the assembled prompt is made of.
  The system prompt card sits above Compaction, since it is the first thing the budget is spent on.
- A rail row is flush with the window edge: `.settings__nav` has no inline-start padding and the rows carry the inset
  themselves (`padding-inline-start: var(--space-7)`, `border-radius: 0 var(--radius-pill) var(--radius-pill) 0`). That
  is what makes a hovered or selected row's fill reach the edge, the way Chrome's own rails behave. Never re-add the
  rail's inline-start padding; it clips the fill.
- The open section is the URL fragment: General is the bare page and every other section is `#<id>`
  (`settings.html#templates`) — no slash, because Chrome's extension loader opens a URL path verbatim as a file, so a
  path segment cannot exist and the slash would only be decoration. The page reads the fragment on mount, normalises an
  unknown or hand-typed one with `replaceState` (through a `URL`, since an empty hash must remove the fragment), syncs
  on `hashchange`/`popstate` (Back and Forward work) and pushes a new entry per rail click. `openSettings(section)` in
  `src/platform/chrome.ts` opens Settings at that fragment: it focuses the window, then activates the one Settings tab
  and moves it to the section (`tabs.update`), creating the tab only when none is open. That reuse is why the manifest
  requests `tabs`; never open a second Settings tab.
- A menu that points at a section uses `SettingsButton` (icon-only gear, `title` + `aria-label` such as "Manage
  templates"), not a sentence. The Tools menu has **one** gear for its one destination, Settings → Tools (`#tools`).
- The two rail links that leave Settings come last, after `.settings__divider`, and neither is a section:
  `Platform Settings…` and `Privacy and security…` have no entry in `SETTINGS_SECTIONS` and no hash, so they are direct
  children of `.settings__nav` styled with `.settings__nav-action` rather than `.settings__nav-item`. There is no footer
  wrapper — the rows really are the last items of the menu — and the divider is a hairline in `var(--separator)`, the
  token the cards already use. Both open Chrome's own pages through `tabs.create` (`openPlatformSettings`,
  `openExtensionSiteDetails`), because a `chrome://` URL cannot be an `<a href>` (a renderer-initiated navigation to a
  privileged scheme is blocked). Outside an extension there is no id to name, so both render disabled with
  `RAIL_LINK_UNAVAILABLE` as the tooltip.
- A rail link carries **two** icons, and unlike a section row it keeps its own: the leading icon (`Puzzle` for Platform
  Settings, `Shield` for Privacy and security) and a **trailing** `SquareArrowOutUpRight` after the label, which is how
  Chrome marks its own Extensions row. The label fills the row (`flex: 1 1 auto`) so the trailing glyph sits on the far
  edge; below 900px the label and that glyph both disappear and the leading icon centers, exactly like a section row.
  Their labels are ellipsised (`Platform Settings…`, `Privacy and security…`) and there is deliberately no hint
  paragraph: the row `title` carries the whole explanation.
- Card title is sentence case (`Built-in tools`, `Memory settings`); the rail label alone is title case (`Tools`). An
  MCP server's card title is its label, not a section name.
- **Tools is one section, and a tool set is the unit.** The built-in tools are the first card, then one card per MCP
  server, all built from `ToolRow` — so a built-in tool and an MCP tool have the same checkbox, badges, description and
  auto-approve switch. Availability is a **checkbox** (`Checkbox` in `src/app/components/Checkbox.tsx`, shared with the
  composer tree); auto-approve is the `Switch` on the trailing edge with the caption `Auto-approve` and the tooltip
  `Run without asking`; a whole set is a tri-state checkbox (`indeterminate`), never a switch.
- All selection maths lives in `src/core/tool-selection.ts` — `builtInSelection`, `setBuiltInEnabled`,
  `mcpServerSelection`, `setMcpServerEnabled`, `setMcpToolAutoApprove` and friends. Do not re-derive a group state in a
  component; the composer tree renders the same rules and the two must not drift.
- A real setting row must not be a `<label>` wrapping a button (a click would toggle twice); `ToolRow` keeps the
  checkbox outside the text column for that reason.
- One control per `.field`, label first, hint second. Reuse `Switch`, `SwitchField`, `RangeField` and `SelectField` from
  `fields.tsx` rather than new controls. `SwitchField` is the label + switch row (`Field` cannot hold a switch: it
  renders a `<label>`, and a button inside a label toggles twice).
- Editing a list item happens **in place**, not in a second card under the list: `ToolsSection` replaces that server's
  card with `McpServerEditor` and appends the editor for a new one, so the form is a `.mcp-editor` child of the card.
  Prefer this for any future list editor; `PromptTemplatesSection` and `MemorySection` still open a separate card.
- A provider's models are a **table** (`ProviderModelTable`), not a textarea: one row per id with a **Use** switch,
  `input` and `output` modality glyphs (`ModalityIcon`, shared with the model picker), context, max output and a
  per-model **Reasoning** select. `Refresh` writes `models` (the chat ids the pickers offer) and `modelDetails` (what
  the server reported); a model with Use switched off stays in the table but out of the pickers. A `~` marks a catalog
  estimate rather than the server's own figure. Only an id the user typed by hand gets a Remove button (on hover) — the
  server's own models cannot be deleted from here, which is what the Use switch is for. A loaded preset shows a green
  check with the tooltip `Loaded in the server`, never a word. Per-model reasoning lives in
  `ProviderSettings.modelThinking` and falls back to `DEFAULT_THINKING` (`auto`) through `thinkingForModel`; the
  composer chip writes that entry, so there is no global reasoning setting. Nothing in the table is inferred from an id:
  `Refresh` only seeds `models` while that list is still empty, and afterwards the ticks are the user's.
- **The default model is a star in that table**, not a separate selector: filled `Star` (`--accent`, `role="img"`,
  `aria-label="Default model"`) on the default row, a ghost button `Make {id} the default model` on every other.
  Starring also switches **Use** on, because only a model in use reaches the pickers, and switching Use off or removing
  the starred row clears the local star. The star is draft state in `ProviderEditor` (`defaultModelId`), so it only
  moves `settings.defaultModel` on Save — Cancel leaves it alone. Every write goes through
  `resolveDefaultModel(providers, current, requested)` in `src/core/settings.ts`, which keeps the current default unless
  it is no longer offered, so removing a provider or an id re-defaults instead of leaving a reference that would fail
  every run. The composer's model picker is **per chat** and never writes the default.
- **Site access belongs to the Base URL, not to the model list.** The Base URL row is a stacked `.field` holding
  `.url-row` (input + `Check site access`) and, underneath, the answer (`Host access granted.` or
  `Chrome has not granted access to {host}.` with `Grant host access`). `Refresh` sits alone under the table. The row is
  a plain `<div>`, not `Field`, because a button inside that `<label>` would fire twice.
- **A plain-HTTP address is a privacy warning, not a validation error.** Directly under `.url-row` (above the host
  answer, so it shows before Chrome has been asked for anything) `.url-warning` names the host and says that every
  device in between can read the prompt and any page attached to it, and that an https address, a VPN or a trusted
  network is what makes it safe. The test is `insecureEndpoint(baseURL)` in `src/core/endpoint.ts` — http to a host off
  this machine; loopback (`localhost`, `*.localhost`, 127/8, `::1`) is exempt because that traffic never leaves the
  machine, so the ordinary local setup carries no badge. The copy lives in that module, never in the component; the
  model picker renders the same warning as a glyph on the provider's heading.
- The MCP server's headers are `Name`/`Value` rows (`HeaderRow` + `headersToRows`/`rowsToHeaders` in `src/core/mcp.ts`),
  not a textarea: one row per pair with a trash button, and an "Add header" button below. The helpers own validation (a
  fully blank row is dropped; a name without a value, an invalid name and a repeated name are row errors) so the
  component only renders `headerErrors`.
- Card titles and control labels are quoted verbatim in the ontology. Never invent a second word for a setting that
  already has an entry.

See `../AGENTS.md` for architecture and `../../ontology.yml` for names.
