# `src/app` — agent guide

The side panel UI. React 19, plain stores via `useSyncExternalStore`, no CSS framework beyond the Tailwind file that
styles Streamdown (`tailwind.css`).

Vocabulary for this area lives in `ontology.yml` under `ui` (groups: `panel`, `composer` with `chips`/`menus`/`actions`,
`message`, `numbers`, `atoms`). Product terms it renders — `conversation`, `turn`, `answer`, `prompt-queue` — are at the
top level of that file. Read the entry before naming a component, class or string.

Local rules:

- Component name is the concept: `Composer`, `PromptTemplateMenu`, `ToolCallCard`, `ContextMeter`. No `Widget`/`Panel`
  suffixes except `Header`, `Transcript`, `HistoryPanel`.
- Classes are BEM-ish with a block per component: `.composer__toolbar`, `.tool__head`, `.meter__segment`. Shared atoms
  are bare blocks: `.chip`, `.badge`, `.popover`, `.field`, `.button`, `.checkbox`.
- `.composer__topbar` is not the panel `header`; it is the strip inside the composer box holding the page list. The bar
  itself stays one line: `PageListToggle` shows the hint, or — from the first page on — a page icon and count. That
  count opens `PageList`: a stacked `ol` above the box, so the list grows upwards and never squeezes the prompt. An add
  opens it by itself (`lastPageAddedStore`); a row is dimmed with a trash can until a turn carries its page; the Expand
  toggle keeps its own space. The count's icon pulses while `addPageBusy` is on (capture and markdown conversion, under
  a second) and never for a page that is merely waiting for a turn.
- `.composer__box` owns the composer's **one** gutter (`padding: var(--space-2)`, 4px on all four sides); the topbar and
  the toolbar add no `padding-inline` of their own, which is what keeps the buttons above and the chips below the same
  distance from the border. Every control in those two rows is 24px (`.button--sm`, `.chip`): a chip must never be
  taller than its neighbours, so a count inside one is a bare `.chip__count`, never the bordered `.badge` atom.
- The add button (`+`, `.composer__add-page`) asks nothing of Chrome. It opens the grant box above the box — the same
  `.banner--warn` a parked tool uses — and that box's **Continue** is the click that raises Chrome's modal. Both kinds
  are stored in `pageAccessStore` and worded by `describePageAccess` in `src/core/page-access.ts`: the panel writes no
  part of that copy itself, and only a search gets `button--primary` on Continue, because only there is the permanent
  grant the recommended route.
- A page row's stamp is absolute, never relative: the clock time to the second, the date only when the capture is on
  another day (`.page-chip__stamp`, `stampTime`), and the full instant in the `<time>` tooltip (`stampTooltip`). A
  countdown-style label would start lying the moment the list sat open. Never re-word a stored `capturedAt`; format it
  at render, in the user's locale, with `Intl` — no date library.
- The border is the prompt editor, so a click anywhere inside it focuses the textarea (`focusPrompt` in `Composer.tsx`,
  guarded by `BOX_CONTROL_SELECTOR`): the empty topbar gap and the space after the last chip would otherwise drop the
  caret to `<body>`. A control inside the box keeps its own click, and `.popover`/`.slash` are excluded because their
  padding is menu surface. `.composer__box` carries `cursor: text` for the same reason, which both menus reset to
  `default`; the caret goes after the existing text, since the click was not about placing it.
- The model chip opens `ModelPicker` above the chip, like every other chip menu, with `align="trailing"`: the chip sits
  in the middle of the toolbar, so neither of its own edges is at the panel's, and the menu's trailing edge is pinned to
  the toolbar's instead (`width={300}` keeps it a chip menu, so a long id ellipsizes). A row is a wrapper
  (`.popover__model`) holding the selecting button and the star, because a button cannot hold a button; the wrapper
  carries the hover and the tint, so the two still read as one row. The first line is the model's name and its state —
  `CircleCheck` when the server has it loaded, and the trailing `Star`: filled and read-only for the default model,
  outlined and clickable on every other row, which is the same pair Settings → Providers has, so the default is set in
  one click from the picker instead of only from Settings. `onDefaultChange` moves `defaultModel` and nothing else: it
  does not touch this chat's model or close the menu. The second line is the facts, left-aligned under the name — the
  `context / max output` figures, the modalities as input glyphs `→` output glyphs, and a `MessageCircleMore` glyph
  after the output glyphs for a model that reasons, drawn exactly like a modality glyph so the word is only its
  `aria-label`. The row's own accent tint is the only "this is the one in use" mark; a tick beside the name said the
  same thing twice and read as a second state icon. Each figure carries the catalog's `~` when it is a guess, as in
  Settings. Glyphs come from `ModalityIcon`, shared with the Settings table; a model whose server reported nothing shows
  the same `—`, never a guess. The chip states capability only — the effort stays in the Thinking chip next to the model
  chip.
- `StepsGroup` owns the transcript's steps: `ReasoningBlock` and `ToolCallCard` are rows inside it, flat (no card border
  or background), and the whole group folds into one `.steps__summary` line once the run ends — unless a row still needs
  the user. The rail in `.steps__list` is what makes the rows one flow; do not give a row its own surface again.
- The Tools chip opens `ToolTree`, one expandable tree of **tool sets**: the built-in set and each MCP server are peers,
  a group head is a tri-state `Checkbox` plus a disclosure button, and a tool is a checkbox with its name above its
  description (the name and description stay stacked — never side by side). Expansion is in-memory `useState`, all
  collapsed on open. The menu only switches availability; auto-approve is Settings → Tools. All group maths comes from
  `src/core/tool-selection.ts`, which Settings imports too.
- UI strings are quoted verbatim in the ontology. Change the string and the entry together.
- `HistoryPanel` renders the **chats drawer**; the UI word is "Chats", never "History panel".

See `../AGENTS.md` for architecture and `../../ontology.yml` for names.
