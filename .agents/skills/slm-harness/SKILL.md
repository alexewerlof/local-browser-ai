---
name: slm-harness
description: >
  Design and review changes in Local Browser AI against the hard limits of local small
  language models: a small context window, 10-20 tokens/s generation, a time-to-first-token
  cost that is paid again whenever the prompt prefix changes, and brittle tool calling.
  Use this skill whenever a task touches prompt or context assembly, compaction, page
  capture or reading, retrieval, tool results, MCP payloads, model calls, provider
  adapters, or the streaming UI — and whenever someone asks why the panel is slow, why the
  model ignored a page it was given, why a turn used so many tokens, or whether to add a
  vector index, an embeddings model, or a summarizing call. Load it before adding a tool,
  before adding a settings field that changes the prompt, before changing anything a
  previous turn already sent, and before designing UI that shows model progress.
---

# Building for small local models

This harness is not a wrapper around a frontier API. The model is usually 3B-12B running
on the same machine as the browser: a few thousand tokens of prompt already takes seconds
to process, generation crawls, and a model that confidently calls `read_section("h4")` on a
page whose headings are `h0`-`h3` will not tell you it guessed. Everything in this repo that
looks fussy — frozen page blocks, outlines instead of text, clipping at 4,000 characters,
compaction before a request instead of during one — exists because of that.

The reason to load this skill is not to follow rules. It is that a change which looks like
an improvement on a frontier model is routinely a regression here, and the regressions are
quiet: the answer is still plausible, it just took four minutes and half the context window.

## The constraint model

Everything below follows from four costs. When you are unsure about a decision, ask which
of these it moves, and in which direction.

| Cost                    | What the user feels                             | The lever                                                        |
| ----------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| Prompt processing       | Seconds of nothing before the first token        | Keep the prefix byte-identical between turns; make the prompt small |
| Generation speed        | A slow, visible trickle of words                 | Ask for less output; prefer one targeted call to three broad ones  |
| Context window          | "It forgot what I said", or a hard failure       | Spend tokens on structure and handles, not on prose               |
| Tool-call reliability   | Wrong argument, invented section, silent no-op   | Fewer tools, tighter schemas, results the model can act on        |

Rough orders of magnitude on a 12B model on a normal laptop: prompt reprocessing runs at
maybe a hundred to a few hundred tokens/s but is free on a cache hit; generation runs at
10-25 tokens/s; so a 6,000-token prompt that misses the cache costs longer than the whole
answer, and a 3,000-token page dumped inline costs minutes on every turn it stays attached.
Measure on the target machine rather than trusting these numbers — the shape of the problem
is what matters, and it is the shape that all four rules protect.

## The four invariants

### 1. The prompt only grows at the end

A turn's request must be a superset of the previous turn's request, byte for byte, up to the
point where the new content starts. This is what makes a local server's prefix cache worth
anything: the model reprocesses only the new tail instead of the whole conversation.

Concretely, in this repo:

- Page blocks are rendered once at capture and stored; nothing re-renders, reorders or
  edits an earlier block. The outline is not recomputed, the timestamp is not refreshed,
  and adding a second page does not touch the first.
- Tool calls and their results are replayed verbatim. Calls that never finished are dropped,
  so no provider sees a dangling request — but a finished call is never rewritten.
- Assembled context has a fixed shape: system, environment, memory, the MCP note, the
  summary, the archived page blocks, then history and the new turn. A new contributor does
  not get inserted between existing ones, because that would move every token after it.
- Compaction is the one sanctioned rewrite. It happens at a turn boundary, before the
  request that would overflow, and it replaces a prefix wholesale rather than nudging it.
  Accept the single cache miss; carrying the tokens on every later turn is the worse trade.

If a change could alter one byte of something a previous turn already sent, treat that as a
design error, not a formatting detail. There is a scenario test that exists purely to catch
this.

### 2. A page is a handle, not text

Page text is unbounded and the context window is not. So a page enters the prompt as a
compact block: title, URL, capture time, size, and an outline of headings with ids and a
token cost per section. The model then reads what it needs by heading.

- Default is the outline. A small model navigates "here are 9 sections, section `h4` is
  ~28 tokens" far more reliably than it reads 40,000 characters and finds the number.
- Reading is a tool call with a mode: outline, specific sections, whole page clipped, or a
  phrase find across pages. The model chooses; the harness never guesses for it.
- Never map-reduce a page to "fit" it. Summarizing a page piece by piece costs several
  extra generations, and it deletes exactly the detail the user attached the page for.
  Structure plus a targeted read keeps the detail and costs one call.

When a page genuinely does not fit even section by section, the answer is a narrower
request — smaller sections, a find query, a tighter `maxChars` — not a different pipeline.

### 3. Every model call has to earn its latency

At this speed, an extra round trip is not "a bit slower", it is a visible stall. So:

- The harness does the work deterministically whenever it can. Token estimates, outline
  construction, section splitting, BM25 ranking, phrase matching: no model involved.
- Exactly one place summarizes, and it is compaction. Nothing summarizes tool output,
  MCP output, page content or the user's own words to make the prompt prettier.
- A failure must be cheaper than a retry. If the model emits a tool call the schema
  rejects, the harness reports a structured error the model can recover from on its next
  step; it does not silently re-ask in a loop, and it does not spend a call "fixing" its
  own summary.
- Length is a feature. Asking for a 200-word answer rather than an essay doubles the
  perceived speed at no cost to quality.

### 4. Everything the model receives is bounded, clipped and data

- Tool results, page text and MCP payloads have a hard ceiling with an explicit truncation
  marker. The model can always ask for a narrower region; it cannot un-clip a wall of text
  it never saw the end of.
- Tool schemas describe the narrow form first, so "read section `h4`" is the obvious call
  and "give me everything" is the awkward one.
- Model-facing names and descriptions are part of the prompt budget and part of the naming
  contract. One tool per job, with a `mode` enum for a variant, beats four overlapping
  tools: each tool costs its schema on every request and a wrong pick costs a whole turn.
- Everything a tool returns is untrusted data. A page that says "ignore your instructions" is
  still a page: the block says so in its own footer, and the model is told the content is
  data before it ever reads a line of it.

## Decisions that come up constantly

**New tool?** First ask whether an existing tool with a new `mode` would do — the model picks
one tool with an enum more reliably than it picks among siblings, and you pay for every
schema on every request. A `mode` is right when the difference is _which part_ of the same
thing comes back; a second tool is right when the difference is _what it does_, especially
if one form needs approval and the other does not. New tool means: an id in the read-only
or action list, an entry in the tool-version map with the settings version it ships in, an
auto-approve decision, an ontology entry, and a label in prose for the card.

**New text in the prompt?** It must earn its permanent cost. Ask what the model does worse
without it, then ask whether it can be shorter, injected only when relevant, or moved into
tool output the model requests instead. Anything unbounded — a list of memories, a folder
of notes, a search result set — gets a share of the window and a clip.

**Another model call?** Almost always no. If the goal is to sort, match, split, rank or
measure text, do it in code. The legitimate additions are a summary at compaction and the
model's own tool loop.

**Content the user can see?** Show actions in prose and their state; hide the harness's own
bookkeeping. A user does not want to watch memory injection or token estimation, but does
want to know that a page was read, what came back, and why the model is waiting on them.

**A setting?** Settings that change the prompt are migration hazards: every field needs a
default, a schema bound, and a reason the user would ever move it. Prefer a good fixed
choice over a knob nobody understands.

**A context window?** It is a catalog fact plus a per-provider override, never something the
SDK reports — the SDK has no idea. From it come the usable window and the compaction
threshold. After a request completes, provider-reported usage is the only truth; anything
computed before the call is an estimate and should be labelled as one in your head.

## Failure modes and how this harness answers them

Small models fail in regular, predictable ways. Each of these is a pattern to reach for,
not a bug to patch ad hoc:

| Symptom                                                  | Response                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Calls a section id that does not exist                    | Return the outline with the error so the next step can recover; never invent the section                     |
| Re-reads a section it already has                         | Replay the earlier call and its result verbatim, so the transcript itself is the reminder                    |
| Reads everything "to be safe"                             | Make outline the default and make `all` explicitly clipped; describe the narrow modes as the normal path     |
| Ignores a page it was given                               | The block must name the handle and how to read it. A handle with no readable tool is not a feature            |
| The model has no tool support                             | Refuse the page add outright; an outline the model cannot expand is worse than a clear "this model cannot read pages" |
| Emits malformed tool arguments                            | Report a structured, retryable error naming the parameter; the step ends, the turn does not                      |
| Guesses across several pages                              | Require an explicit handle as soon as more than one page is attached; ambiguity is a question, not a heuristic |
| Loops within a run                                        | Bound the steps per run and let the loop end with what it has; a stopped run is better than a spinning one     |
| Answers from a summary as if it were the source           | Summaries say they are summaries, and page handles survive compaction so the model can go back                 |

## Anti-patterns

These are the changes that look harmless and are not. If you are about to do one, say why
in the change description or do not do it.

- Re-rendering a page block to fix its outline, refresh its stats or add a field. It rewrites
  history and throws away the cached prefix for every turn after it.
- Adding an embeddings index, a vector store, or a background model in the service worker to
  "retrieve better". Retrieval here is lexical and instant; a background model also breaks
  the rule that only the panel talks to a model.
- Summarizing tool or MCP output before the model sees it. Deterministic clip, then let the
  model narrow.
- Stuffing the whole page "just this once" because the section split looked awkward.
- Rendering a whole-run spinner, or a progress bar for an invisible pipeline. The user should
  see which action is happening and where it is blocked.
- Adding a tool whose result is a handle with no text when the model cannot read the handle.
- Making a schema stricter without deciding what the model sees when it fails the schema.
- Bumping a provider or SDK in isolation: the adapters pin a shared provider runtime, and a
  half-upgraded family silently nests a second copy.

## Verify before calling it done

The repo already has the instruments; use them instead of reasoning from first principles.

- `npm run bench` for what a page block costs on a given page shape. Run it before and after
  a block change.
- The browser scenario suite runs against a fake OpenAI-compatible server that records every
  request body, so a change to the prompt can be diffed rather than argued about. The
  cache-stability scenario is the one that proves nothing earlier moved.
- Provider-reported usage is the source of truth once a request completes; the local estimate
  (CJK one token per character, otherwise roughly four characters per token, plus per-message
  overhead) exists only for pre-flight decisions. Do not tune a budget against the estimate
  when real usage is available.
- Run typecheck, lint and tests before claiming a change works, then the formatter. A prompt
  change that passes typecheck can still add a kilobyte to every request.

## Reference files

Read the one that matches the change; they hold the depth this file deliberately skips.

- `references/kv-cache.md` — how prefix caching behaves on local servers, what invalidates it,
  and how to reason about a specific edit.
- `references/retrieval.md` — BM25, outline construction, section granularity, multi-page
  reads, and why no embeddings.
- `references/tools-and-mcp.md` — schema budget, clipping, approval, MCP failures, and
  recovery from bad tool calls.
- `references/latency-ux.md` — what to surface during thinking and acting, wording, states,
  and how to show a truncation or a stall honestly.
