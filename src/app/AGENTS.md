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
- `.page-list` is the composer's top band, not a card above it and not prompt chrome: one row — `ChevronRight` closed /
  `ChevronDown` open at 13px, a `.page-list__count` caption (`1 page`, `2 pages`) and **Add page** at the trailing edge
  — with the flat `ol` under it. With no pages the caption is a static `0 pages` and there is no chevron, because there
  is nothing to open; `Add page` stays, so the control that fills the list has one home. **The composer is one
  surface**: `.composer__editor` owns the only border and radius, the band separates from the prompt with a hairline
  (`.page-list` `border-bottom`, plus one under the header while the list is open), and `.composer__box` draws no border
  at all — so the page list and the prompt read as the two bands of one control while staying two interactive areas: a
  click on the header or a row is never a click in the prompt. **The focus ring is the prompt's, not the surface's**:
  `.composer__box::after` draws a 1px accent edge over the editor band alone — its top side is the hairline under the
  band — and `:has(.composer__input:focus)` shows it only for the prompt's own focus, which is why `submit` hands the
  caret back to the textarea. A chip, a menu or a page row can hold focus while a keystroke reaches nothing, and a
  border that says "type here" then is a lie; the page band keeps the composer's neutral edge throughout. **The band
  highlights as a row, never as a box**: hover and keyboard focus tint the full-width `.page-list__head`, and
  `.page-list__toggle` drops the global `:focus-visible` outline — that ring hugs the left half of the row and, offset
  above the prompt, read as a second composer. An add opens the list by itself (`lastPageAddedStore`); a row is dimmed
  with a trash can until a turn carries its page. The caption pulses while `addPageBusy` is on (capture and markdown
  conversion, under a second) and never for a page that is merely waiting for a turn.
- `.composer__resizer` is the composer's top edge and its only resize affordance: the visible 2px rule is `::before`,
  which lets the grab strip be 10px tall and overhang 4px into the transcript's own bottom padding. The limits are
  measured when the gesture starts (`composerLimits` in `src/app/composer-size.ts`), so a queued prompt or an open page
  list raises the floor instead of being clipped. **The rows above the prompt are paid for by the transcript**: the
  `fit` effect measures the chrome (`.composer` height minus the editor band's) and moves a sized composer by exactly
  its change (`composerHeightForChrome`), so the page list opening grows the composer upward instead of shrinking the
  prompt — which is what a sized composer used to do, hiding the textarea at its floor. A drag never takes focus from
  the prompt (`preventDefault` in `pointerdown`, capture for the rest of it), and the height stays in memory — never
  settings, never `ui-state.v1`.
- `.composer__box` is the editor band and the composer's **one** gutter (`padding: var(--space-2)`, 4px on all four
  sides); the toolbar adds no `padding-inline` of its own, which is what keeps the chips the same distance from the
  surface's edge. The page band above it insets its head and rows by `--space-3` and the disclosure adds `--space-2` of
  its own, so the chevron and the row icons line up with the prompt's text. Every control in the box is 24px
  (`.button--sm`, `.chip`): a chip must never be taller than its neighbours, so a count inside one is a bare
  `.chip__count`, never the bordered `.badge` atom.
- **Add page** (`.page-list__add`, a ghost `.button--sm` with a text label and no icon) asks nothing of Chrome. It opens
  the grant box above the box — the same `.banner--warn` a parked tool uses — and that box's **Continue** is the click
  that raises Chrome's modal. Both kinds are stored in `pageAccessStore` and worded by `describePageAccess` in
  `src/core/page-access.ts`: the panel writes no part of that copy itself, and only a search gets `button--primary` on
  Continue, because only there is the permanent grant the recommended route.
- A page row's stamp is absolute, never relative: the clock time to the second, the date only when the capture is on
  another day (`.page-chip__stamp`, `stampTime`), and the full instant in the `<time>` tooltip (`stampTooltip`). A
  countdown-style label would start lying the moment the list sat open. Never re-word a stored `capturedAt`; format it
  at render, in the user's locale, with `Intl` — no date library.
- The border is the prompt editor, so a click anywhere inside it focuses the textarea (`focusPrompt` in `Composer.tsx`,
  guarded by `BOX_CONTROL_SELECTOR`): the space after the last chip would otherwise drop the caret to `<body>`. A
  control inside the box keeps its own click, and `.popover`/`.slash` are excluded because their padding is menu
  surface. `.composer__box` carries `cursor: text` for the same reason, which both menus reset to `default`; the caret
  goes after the existing text, since the click was not about placing it. The page header is outside the border, so none
  of its clicks reach this handler — that is the point of the split.
- The model chip opens `ModelPicker` above the chip, like every other chip menu, with `align="trailing"`: the chip sits
  in the middle of the toolbar, so neither of its own edges is at the panel's, and the menu's trailing edge is pinned to
  the toolbar's instead (`width={300}` keeps it a chip menu, so a long id ellipsizes). A row is a wrapper
  (`.popover__model`) holding the selecting button and the star, because a button cannot hold a button; the wrapper
  carries the hover and the tint, so the two still read as one row. The first line is the model's name and its state —
  `CircleCheck` when the server has it loaded, and the trailing `Star`: filled and read-only for the default model,
  outlined and clickable on every other row, which is the same pair Settings → Model Providers has, so the default is
  set in one click from the picker instead of only from Settings. `onDefaultChange` moves `defaultModel` and nothing
  else: it does not touch this chat's model or close the menu. The second line is the facts, left-aligned under the name
  — the `context / max output` figures, the modalities as input glyphs `→` output glyphs, and a `MessageCircleMore`
  glyph after the output glyphs for a model that reasons, drawn exactly like a modality glyph so the word is only its
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
