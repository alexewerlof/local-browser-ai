# Local Browser AI

A browser-aware AI chat harness that lives in your sidebar. It talks to the page you are reading, keeps an honest eye on
the model's context window, and lets you choose the model: the one built into your browser, a server on your own
machine, or a hosted API.

## What it does

- **Any provider, one interface.** Built-in Prompt API, local servers (llama.cpp, Ollama, LM Studio, vLLM) and hosted
  APIs (OpenAI, Anthropic, DeepSeek) are adapters over the Vercel AI SDK. Add as many as you like and switch models per
  chat.
- **Chat with the current tab.** Click the toolbar icon and the page is extracted, cleaned with Readability, converted
  to markdown and attached. The model sees the whole page when it fits, and an outline plus the most relevant excerpts
  when it does not.
- **Built-in tools.** The model can read the page, list its sections, search it, read the current selection, check the
  current date and time, search the web with your default search engine, and open links in a new tab (with your
  approval). A web search opens the results in a new tab; the model cannot read them, so it asks you to attach that tab
  when it needs the content.
- **Memory.** A flat list of notes that survives across chats. An always-on memory is injected into every turn, an auto
  memory only when your message matches it, and a tool-only memory stays in storage until the model searches for it with
  `recall`. The model saves new memories with `remember` without asking, but changing one it already saved asks first.
  Edit, make one always-on, delete or export them in **Settings → Memory**.
- **Context budgeting and compaction.** A meter below the composer shows what the system prompt, page, summary and
  history cost. When usage crosses the threshold, the oldest turns are summarized so the conversation keeps going.
- **Skills.** Reusable prompt templates, available from the Skills menu or with `/`.
- **Rendering.** Answers are rendered as streaming markdown (Streamdown), with GFM tables, task lists and copyable code
  blocks. Math is typeset with KaTeX and code highlighting uses Shiki; both are switched in **Settings → General →
  Rendering** because each loads a large chunk on demand. Math is on by default, highlighting is not.
- **Reasoning controls.** Thinking effort where the provider supports it (Anthropic budgets, OpenAI-style efforts), with
  collapsible reasoning in the transcript.
- **Local history.** Conversations live in IndexedDB in your browser profile.

## Install

- Chrome Web Store: _coming soon for 3.0_
- For development: `npm install && npm run build`, then open `chrome://extensions/`, enable **Developer mode**, choose
  **Load unpacked** and point at `dist/`.

## Providers

### Built-in browser model

Chrome and Edge ship a small model behind the Prompt API. It needs no key and no network after the first download. Open
the panel, attach a page and press **Download model** when prompted. Hardware requirements are Chrome's.

### Local servers

Add a provider in **Settings → Providers → Local server (OpenAI-compatible)**:

| Server                     | Base URL                    |
| -------------------------- | --------------------------- |
| llama.cpp (`llama-server`) | `http://localhost:8080/v1`  |
| Ollama                     | `http://localhost:11434/v1` |
| LM Studio                  | `http://localhost:1234/v1`  |

Loopback hosts are already allowed. For a server on another machine, Chrome asks for permission the first time you save
the provider or fetch its models — one prompt per host, and the grant covers every port on that host. Local servers
usually do not report a context window, so set an override — the default is 8k and the meter and compaction depend on
it.

### Hosted APIs

OpenAI, Anthropic and DeepSeek presets ask for a base URL and an API key. Keys are stored in `chrome.storage.local`,
never synced, and only sent to the endpoint you configured. Anthropic requests from a browser need the
`anthropic-dangerous-direct-browser-access` header, which the adapter sets.

## How page context is chosen

| Page size relative to the window  | What the model gets                         |
| --------------------------------- | ------------------------------------------- |
| Fits (≤ 45% of the usable window) | The whole page as markdown                  |
| Too large                         | The outline plus the best-matching excerpts |

Tools can read any section on demand. Extraction drops scripts, styles, navigation chrome, hidden nodes and tracking
parameters, resolves relative URLs, follows open shadow roots and same-origin iframes, and keeps code-fence languages.
You can change the strategy in **Settings → Context**.

## Privacy

Page content is only read when you attach a tab, and only sent to the provider you selected. API keys never leave the
extension's local storage except in requests to that provider. There is no telemetry. See
[privacy.txt](public/privacy.txt).

Memories are stored in `chrome.storage.local` in this browser profile and are sent to the provider you selected, as part
of the prompt. They are not synced and not sent anywhere else. **Settings → Memory → Export memories** writes them to a
JSON file if you want them on another machine; import merges by id and keeps the newest version of each memory.

## Development

```shell
npm run dev        # build in watch mode
npm run serve      # serve dist/ at http://localhost:4173 for manual testing
npm test           # unit tests (Vitest)
npm run e2e        # browser scenarios against a fake OpenAI-compatible server
npm run e2e:ext    # load dist/ as a real extension in Chromium
npm run typecheck
npm run lint
npm run fmt
```

The side panel is a normal web page, so the e2e harness runs it with a small `chrome.*` shim and a recording fake
server. See `AGENTS.md` for the architecture and the rules that keep it maintainable.

## Licence

MIT
