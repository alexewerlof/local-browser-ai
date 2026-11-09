# `src/app` — agent guide

The side panel UI. React 19, plain stores via `useSyncExternalStore`, no CSS framework beyond the Tailwind file that
styles Streamdown (`tailwind.css`).

Vocabulary for this area lives in `ontology.yml` under `ui` (groups: `panel`, `composer` with `chips`/`menus`/`actions`,
`message`, `numbers`, `atoms`). Product terms it renders — `conversation`, `turn`, `answer`, `prompt-queue` — are at the
top level of that file. Read the entry before naming a component, class or string.

Local rules:

- Component name is the concept: `Composer`, `SkillMenu`, `ToolCallCard`, `ContextMeter`. No `Widget`/`Panel` suffixes
  except `Header`, `Transcript`, `HistoryPanel`.
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
