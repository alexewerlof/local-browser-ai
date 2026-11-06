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
  are bare blocks: `.chip`, `.badge`, `.popover`, `.field`, `.button`.
- `.composer__topbar` is not the panel `header`; it is the strip inside the composer box holding the page list. It stays
  one row: `PageList` scrolls horizontally, it never wraps, and the Expand toggle keeps its own space.
- UI strings are quoted verbatim in the ontology. Change the string and the entry together.
- `HistoryPanel` renders the **chats drawer**; the UI word is "Chats", never "History panel".

See `../AGENTS.md` for architecture and `../../ontology.yml` for names.
