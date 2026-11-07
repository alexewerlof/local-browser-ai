# Tool calling and MCP under a small model

A frontier model reads a tool description like a specification and treats the schema as a
contract. A small model reads it like a hint, and fills gaps with the most likely token. So
tool design here is less about correctness and more about removing the opportunity to guess.

## Schema budget

Every tool costs its name, description, and JSON schema on every request, whether the model
calls it or not. On a chat with a handful of tools that is a few hundred tokens before any
conversation; add a generous MCP server and the tool section dwarfs the actual question.

- **One tool per job, with a `mode` for the variant.** The model picks one tool with an enum
  more reliably than four tools with overlapping descriptions, and the enum is cheaper than
  four descriptions.
- **The split is "which part" versus "what it does".** Same thing, different slice: a mode.
  Different action, different approval, different failure: a second tool.
- **Adding a variant inside a tool must not change its approval.** A read-only mode inside a
  tool that can also open a tab still asks only for the form that opens a tab.
- **Optional parameters are a trap.** An optional `page` handle is only safe when there is
  exactly one candidate; otherwise the model omits it and picks for you. Required is the
  default for anything ambiguous.

Descriptions should push toward the narrow call. Name the narrowest useful mode first, say
what it costs, and make "everything" sound like what it is: clipped, expensive, and usually
unnecessary.

## Bounded output

Every model-facing result has a hard ceiling — a few thousand characters, with an explicit
truncation marker. This is a correctness rule, not a cosmetic one:

- The model cannot reason about text it never saw, and a silent cut is worse than a stated
  one. Mark it and say it can ask for more.
- A clipping ceiling makes every payload predictable, so the context budget cannot be blown
  by one server with a verbose JSON response.
- Do not summarize a tool result with a model call before showing it. That is a second call,
  a second failure mode, and a lossy, non-deterministic hop between the server and the model.
  Clip deterministically and let the model narrow its request.

Results that a tool captures on the model's behalf — a page it opened, a search it ran —
should hand back the clipped text, not just a handle. A run's prompt block is frozen at the
start of the turn, so a handle for a page captured mid-run is unreadable: the model cannot
have it. Returning the text is the only way the call is useful in the same step.

## Approval

Read-only tools run on their own. Anything that acts — opens a tab, writes a memory, changes
state — asks first, inline, in the card for that call, with Allow and Deny. Never a generic
spinner while a decision is pending: a blocked run and a slow run look identical otherwise,
and the user's mental model of the app is decided by which one they think they are watching.

Auto-approval is a per-tool, per-server setting, not a default. When a tool ships, decide
explicitly whether it joins the auto-approved list; a tool that writes without asking is a
decision someone has to make on purpose.

## MCP specifics

- **HTTP only.** There is no process to spawn in a browser extension, so stdio servers are
  not supported and should not be offered. Say so in the UI rather than failing later.
- **The panel owns the connection.** Each turn connects, lists tools, and closes every
  client when the run ends. The service worker stays free of MCP entirely.
- **A server that is down is a warning, not a failed turn.** The user can dismiss it and
  keep chatting with what they have.
- **Tools are namespaced** so a server cannot shadow a built-in, whichever order they load in.
- **Server output is untrusted data.** It is displayed, clipped, and quoted; it never becomes
  instructions, and it can never be saved as a persistent always-on memory.
- **Headers are rows, not a textarea.** Name/Value pairs survive editing and validation;
  a free-form blob does not.
- **A server that rejects browser origins needs a browser-side fix.** A server answering 403
  to any request with an `Origin` header is protecting against DNS rebinding, and no script
  can remove that header. The per-server option that strips it exists for this, applies to
  that endpoint only, and is rebuilt from settings on every load so nothing lingers.
- **Test against the fake MCP server, never a real endpoint.** It can require headers and
  reject origins, which is exactly the pair of failures worth proving against.

## When the model calls it wrong

The design goal is that a bad call costs one step, not the turn.

- **Schema failure:** return a structured, retryable error that names the offending
  parameter. The model gets one more step with the outline or the valid values in hand.
- **Unknown section or page handle:** return the error together with the list that would have
  been valid. A small model will otherwise invent a plausible id and read nothing.
- **Empty or refused result:** say what happened in one line and what to try instead — a
  different heading, a narrower query, a page the user has to add. Do not return an empty
  string and let the model narrate.
- **Repeated identical call:** replaying history is the reminder; the transcript already
  shows the result. Bound the steps per run so a loop ends with a partial answer rather than
  running forever.
- **Approval denied:** the card reads "denied" and the model is told plainly, so it can offer
  an alternative instead of retrying the same action.

None of these should require the model to understand a stack trace. The message a tool
returns is prompt text: write it for the model, and let the UI show the same information in
words for the human.
