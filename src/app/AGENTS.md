# `src/app` — agent guide

The side panel UI. React 19, plain stores via `useSyncExternalStore`, no CSS framework beyond the Tailwind file that
styles Streamdown (`tailwind.css`).

Vocabulary for this area lives in `ontology.yml` under `ui` (groups: `panel`, `composer` with
`menu-items`/`menus`/`actions`, `message`, `numbers`, `atoms`). Product terms it renders — `conversation`, `turn`,
`answer`, `prompt-queue` — are at the top level of that file. Read the entry before naming a component, class or string.

Local rules:

- Component name is the concept: `Composer`, `PagesMenu`, `PromptTemplateMenu`, `ToolCallCard`, `ContextMeter`. No
  `Widget`/`Panel` suffixes except `Header`, `Transcript`, `HistoryPanel`.
- Classes are BEM-ish with a block per component: `.composer__menubar`, `.tool__head`, `.meter__segment`. Shared atoms
  are bare blocks: `.menu-item`, `.badge`, `.popover`, `.field`, `.button`, `.checkbox`.
- **The composer is a full-bleed stack of four bands, in this order**: the resize line, the menu bar, the prompt band
  (`.composer__box`, `--bg-sunken`) and the meta row. `.composer` itself has `padding: 0` and no border or radius, so
  nothing is inset from the panel's edges; the queue and the error line are the only children that draw a surface of
  their own, and they carry their own `margin: … var(--space-4)`. `.composer__editor` is just the stack of bar and band
  — it used to own the one border and radius, and both are gone — kept because a sized composer flexes it and because
  `fit` measures the prompt band against it.
- **The focus ring is the prompt's alone**: `.composer__box::after` is a 1px accent edge at `inset: 0` over the prompt
  band, shown by `:has(.composer__input:focus)`, which is why `submit` hands the caret back to the textarea. No menu
  item and no action button is inside that band any more — the buttons moved to the meta row — so nothing else can light
  it, and the band's darker surface is what says where typing goes while nothing is focused. A menu can hold focus while
  a keystroke reaches nothing, and a border that says "type here" then is a lie.
- **The menu bar reads like a window menu**: `Pages`, `Templates`, `Tools`, `Model`, `Thinking`, in that order, one flat
  word each. Every item is a `MenuButton` (`menu-item`, `menu-item__label`, an optional `menu-item__count` pill and an
  optional `menu-item__value`), so the five share a type size, a height and one highlight; an item fills the bar's
  height, as a title does in a window's menu bar, its own `__count`/`__value` shrinks before the word does, and the bar
  wraps rather than clipping an item on a narrow panel or a large text size. There are no glyphs on the bar — the
  concept icons live in Settings, the slash menu and the transcript.
- **One menu at a time, and a hover hands it over** (`src/app/menu-bar.ts`): `openMenuStore` holds the id of the open
  menu, and `useBarMenu(id)` gives each item `open`/`show`/`toggle`/`hover`/`close`. Clicking an item toggles it;
  entering another item with `pointerType === 'mouse'` while a menu is open moves the menu there, which is what a window
  menu bar does and why `toggle` and `hover` are separate rules — a click must still close the menu a hover opened. With
  nothing open the bar is inert, so sweeping the pointer across it leaves no panel behind, and a finger or a pen (which
  report `touch`/`pen`) never hands a menu over: a tap arrives as an enter just before its click and would otherwise
  open and close in one gesture. Every item that unmounts releases the bar, because the store outlives the component.
- **A menu is the body of the item that owns it, not a floating box**: `Popover flush` renders `.popover--flush`, which
  sits on the item's own edge with no gap, squares its two bottom corners and drops its bottom border, and overlaps the
  item by a pixel. The open item is painted above the panel (`z-index: 31` against the panel's `30`) on the panel's own
  surface (`--bg-raised`) with square corners, so the seam and the smudge of the panel's shadow fall behind it and the
  two read as one surface — the sharp bottom corner is what says which menu the panel belongs to. **Every menu hangs
  from its own item's left edge**, the last one included: `Popover` moves a panel that would run past the side panel
  back inside it (measured once after layout, `left` written straight to the node), so the Model menu needs no alignment
  of its own and no wider panel gets a menu that starts somewhere else than the other four.
- `.pages-menu` is the first item and the chat's page list: `Pages` plus the number of pages, which is on the bar
  whether the menu is open or closed. The popover holds a search box over title, host and URL, and a **+** where the
  other menus keep their gear — `aria-label="Add page to chat"`, tooltip naming the tab it would capture. The search
  takes no focus when the menu opens, unlike the other three: a capture opens this menu on its own, and grabbing the
  caret would take it out of the prompt being typed in. Its rows are `.pages-menu__item` wrappers around
  `.page-chip.page-chip--list` (a page reference keeps the `.page-chip` block wherever it is drawn), a row is dimmed
  with a trash can until a turn carries its page, and the plus closes the menu before adding because the grant box asks
  above the composer. **An add opens the menu by itself** (`lastPageAddedStore`) and clears the search; the count pulses
  while `addPageBusy` is on (capture and markdown conversion, under a second) and never for a page merely waiting for a
  turn. Switching chats closes it — the rows belong to one chat, and a switch is only a switch when the id really moved,
  or a capture landing in a chat created in the same tick would open a menu the switch effect had just closed.
  `35-pages-menu` is the scenario.
- `.composer__resizer` is the composer's top edge and its only resize affordance: the visible 2px rule is `::before`,
  which lets the grab strip be 10px tall and overhang 4px into the transcript's own bottom padding. The limits are
  measured when the gesture starts (`composerLimits` in `src/app/composer-size.ts`), so a queued prompt raises the floor
  instead of being clipped. **The rows above the prompt are paid for by the transcript**: the `fit` effect measures the
  chrome (`.composer` height minus the prompt band's) and moves a sized composer by exactly its change
  (`composerHeightForChrome`), so a queued prompt grows the composer upward instead of shrinking the prompt — which is
  what a sized composer used to do, hiding the textarea at its floor. A menu is not a row: the popovers float over the
  transcript, so opening one moves nothing. A drag never takes focus from the prompt (`preventDefault` in `pointerdown`,
  capture for the rest of it), and the height stays in memory — never settings, never `ui-state.v1`.
- `.composer__box` holds the textarea alone, so its `--space-1` vertical padding is the only prompt chrome left: a click
  there focuses the textarea (`focusPrompt`, guarded by `BOX_CONTROL_SELECTOR`), because a click on a non-focusable
  element would otherwise drop the caret to `<body>`. `.slash` is the one control inside it and keeps its own clicks.
  `.composer__box` carries `cursor: text` for the same reason, which `.popover`/`.slash` reset to `default`; the caret
  goes after the existing text, since the click was not about placing it. The menu bar and the meta row are outside the
  band, so none of their clicks reach this handler — that is the point of the split.
- **The actions are in the meta row, not in the prompt** (`.composer__meta`, trailing edge): Submit (`ArrowUp`,
  primary), Stop (`Square`) while a run streams and Continue (`Play`) while a stopped queue is parked. The row's
  `min-height` is a small button plus its own padding, so the send button appearing with the first character cannot move
  the prompt band by a couple of pixels.
- **Add page** (`.pages-menu__add`, a ghost icon button with `Plus`) asks nothing of Chrome. It opens the grant box
  above the composer — the same `.banner--warn` a parked tool uses — and that box's **Continue** is the click that
  raises Chrome's modal. Both kinds are stored in `pageAccessStore` and worded by `describePageAccess` in
  `src/core/page-access.ts`: the panel writes no part of that copy itself, and only a search gets `button--primary` on
  Continue, because only there is the permanent grant the recommended route.
- A page row's stamp is absolute, never relative: the clock time to the second, the date only when the capture is on
  another day (`.page-chip__stamp`, `stampTime`), and the full instant in the `<time>` tooltip (`stampTooltip`). A
  countdown-style label would start lying the moment the menu sat open. Never re-word a stored `capturedAt`; format it
  at render, in the user's locale, with `Intl` — no date library.
- The border is the prompt editor, so a click anywhere inside it focuses the textarea (`focusPrompt` in `Composer.tsx`,
  guarded by `BOX_CONTROL_SELECTOR`): the space after the last chip would otherwise drop the caret to `<body>`. A
  control inside the box keeps its own click, and `.popover`/`.slash` are excluded because their padding is menu
  surface. `.composer__box` carries `cursor: text` for the same reason, which both menus reset to `default`; the caret
  goes after the existing text, since the click was not about placing it. The page header is outside the border, so none
  of its clicks reach this handler — that is the point of the split.
- The model menu opens `ModelPicker` above the bar from its own left edge, like every other menu: `width={300}` is what
  keeps it a menu rather than a sheet, so a long id ellipsizes in the bar and in a row, and `Popover` shifts the panel
  left only when that width would leave the side panel. A row is a wrapper (`.popover__model`) holding the selecting
  button and the star, because a button cannot hold a button; the wrapper carries the hover and the tint, so the two
  still read as one row. The first line is the model's name and its state — `CircleCheck` when the server has it loaded,
  and the trailing `Star`: filled and read-only for the default model, outlined and clickable on every other row, which
  is the same pair Settings → Model Providers has, so the default is set in one click from the picker instead of only
  from Settings. `onDefaultChange` moves `defaultModel` and nothing else: it does not touch this chat's model or close
  the menu. The second line is the facts, left-aligned under the name — the `context / max output` figures, the
  modalities as input glyphs `→` output glyphs, and a `MessageCircleMore` glyph after the output glyphs for a model that
  reasons, drawn exactly like a modality glyph so the word is only its `aria-label`. The row's own accent tint is the
  only "this is the one in use" mark; a tick beside the name said the same thing twice and read as a second state icon.
  Each figure carries the catalog's `~` when it is a guess, as in Settings. Glyphs come from `ModalityIcon`, shared with
  the Settings table; a model whose server reported nothing shows the same `—`, never a guess. **A provider reached over
  plain HTTP carries one `TriangleAlert` before its name on the group heading** (`popover__group-warning`, `--warning`),
  tooltipped `Unencrypted traffic exposes your prompt and attached pages. Only use over VPN or trusted networks.` — the
  mark is the server's alone, because every model under that heading is reached the same way and a warning on each row
  would only repeat it down the list. A loopback address carries none, because its traffic does not leave the machine.
  **The sentence never names the host**: the address is already on screen in the row above it. It is
  `insecureEndpoint(provider.baseURL).summary` from `src/core/endpoint.ts`, the module that also words Settings → Model
  Providers. The item's `value` states capability only — the effort stays in the Thinking item beside it.
- `StepsGroup` owns the transcript's steps: `ReasoningBlock` and `ToolCallCard` are rows inside it, flat (no card border
  or background), and the whole group folds into one `.steps__summary` line once the run ends — unless a row still needs
  the user. The rail in `.steps__list` is what makes the rows one flow; do not give a row its own surface again.
- The Tools item opens `ToolTree`, one expandable tree of **tool sets**: the built-in set and each MCP server are peers,
  a group head is a tri-state `Checkbox` plus a disclosure button, and a tool is a checkbox with its name above its
  description (the name and description stay stacked — never side by side). Expansion is in-memory `useState`, all
  collapsed on open. The menu only switches availability; auto-approve is Settings → Tools. All group maths comes from
  `src/core/tool-selection.ts`, which Settings imports too.
- UI strings are quoted verbatim in the ontology. Change the string and the entry together.
- `HistoryPanel` renders the **chats drawer**; the UI word is "Chats", never "History panel".

See `../AGENTS.md` for architecture and `../../ontology.yml` for names.
