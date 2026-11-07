# Prefix caching and why the append-only rule exists

## What actually happens on a local server

llama.cpp, Ollama, LM Studio and vLLM all keep the KV cache of the last request and reuse
the part of the new prompt that is an exact prefix of it. A cache hit means those tokens are
not reprocessed at all; a cache miss means the whole prefix is recomputed before the first
token can be sampled. On a 12B model that difference is the gap between "instant" and
"twenty seconds of nothing".

Three details matter more than the marketing:

- **It is prefix-exact.** One changed token near the front invalidates everything after it.
  Changing the system prompt, reordering sections, adding a contributor in the middle, or
  editing a page block all behave the same way.
- **It is per-slot.** Servers cache a limited number of conversation prefixes. Switching
  between two chats can evict the other's cache; that is acceptable and invisible, but it
  means "reload the panel and ask again" is not free.
- **Frontier providers do the same thing differently.** Hosted APIs cache on a prefix of a
  few hundred tokens or more and charge less when it hits. The invariant is identical, so a
  change justified by "the hosted provider handles it" is still a regression locally.

## What the harness does to stay inside the prefix

The assembled context has a fixed order: the system prompt, the environment note, the memory
block, the MCP note, the summary, the archived page blocks, then history and the new turn.
Page blocks belonging to the live history ride on the user turns that introduced them, not
on the system prompt. Each contributor renders once and is stored:

- A page block is produced at capture and saved with its page. Its timestamp goes to the
  second precisely so that two snapshots of one document are distinguishable — not so that
  it can be refreshed later.
- `toModelMessages` prefixes a user turn with the blocks that turn introduced, at most once
  per page. It replays tool calls and results. It drops calls that never got a result,
  because a dangling tool call is rejected by some providers and fabricated by others.
- The queue, the transcript and the conversation are append-only. Regenerating an answer
  replaces the last assistant message, which is the tail — that is allowed. Editing an
  earlier turn is not.

## The compaction boundary

Compaction is the only rewrite, so it is worth being precise about what it costs.

1. **Pre-flight, not mid-stream.** The decision uses a token estimate against a threshold of
   the calibrated window. If the next request would overflow, the run compacts first, then
   sends. Streaming is never interrupted to squeeze tokens.
2. **Cheap pass first.** Finished reasoning traces are dropped and old tool output is
   truncated to a few hundred characters with a marker. This costs no model call and is
   usually enough on a chat that read a lot of pages early.
3. **Summary only if needed.** The oldest turns, keeping the most recent few turns raw, are
   summarized in one call. The new summary merges the previous one, so there is one
   cumulative summary rather than a stack of them; a chain of summaries would be both more
   expensive and less coherent.
4. **Blocks survive.** A summarized turn's page block moves into the system prompt, because
   a summary cannot carry an outline, and a handle the model can still read is worth more
   than a sentence about the page.

The cache miss after a compaction is expected and accepted: it happens once, at a moment
when the alternative is a hard context overflow. What is not acceptable is a "small"
rewrite in the middle of a conversation for cosmetic reasons.

## Reasoning about a specific edit

Ask in order:

1. Does this change any bytes the previous request already contained?
2. If yes, is the change worth a full reprocess of the prefix on the next turn?
3. If yes again, is there a version of the change that only affects what comes after the
   existing content — a new block, an appended tool result, a new system line at the end of
   the system section?

The third question solves most cases. Adding a rule to the system prompt is a prefix change
by nature, so it is a decision, not an incidental edit: it will be paid for once, and then be
free forever — unless the rule is conditional, in which case it changes shape from turn to
turn and is never free.

## Measuring

The strongest signal is already collected: providers report cache-read tokens alongside input
tokens, and the harness accumulates them per answer. A turn whose cache-read count is close
to its input count was almost entirely a prefix hit; a turn with a high input count and a near
zero cache read reprocessed everything. When a slow answer needs explaining, look there
before looking at the machine — a local server with a stable prefix will show a doubling of
speed with no code change at all.

- A request body is recorded by the browser test harness, so "did the prefix move" is a
  string comparison, not an opinion. Snapshot the body, make the change, diff.
- Provider-reported usage is exact and post-hoc. Pre-flight estimates are deliberately crude;
  do not calibrate a threshold against them when a real number exists.
- Watch the time-to-first-token in the per-answer stats. A regression there after a prompt
  change is almost always a cache miss, not a slower machine. Tokens per second tells you
  whether a slow answer was prefill or generation; the two have completely different fixes.
- Remember that a cache hit is a server-side courtesy, not a guarantee. A provider without
  prompt caching makes every rule in this file still correct and every penalty twice as
  expensive, so it is worth knowing which one the user is on before optimizing.
