# Retrieval and reading without embeddings

## Why there is no vector database

An embedding index in a browser extension is three costs wearing one coat: a model to
download and keep warm, a place in the service worker or a worker to run it, and a second
model whose output nobody can audit. It buys "semantic" recall over a corpus that is
usually one to three pages the user explicitly chose. Lexical matching over an outline gets
those pages right, runs in microseconds, and never fails to start.

The stronger argument is architectural: the panel is the only place that talks to a model.
A background embedder would either break that rule or need its own lifecycle, and either way
it adds a failure mode to a feature whose whole promise is "works offline, instantly".

So retrieval has two layers, and neither of them is a model.

## Layer 1: lexical ranking over the page

BM25 over section-sized chunks. It is used for two jobs:

- **Choosing which headings get a quoted preview** in the page index. The index names the
  sections; a preview of the best few tells the model where to look without paying for the
  whole section.
- **Memory auto-recall.** The same ranking decides whether a saved note is relevant to the
  current turn before it gets injected.

Ranking is deterministic and cheap, so it can run on every turn. That is the whole reason it
is allowed to be dumb: a mediocre ranking costs nothing, a second model call costs seconds.

Note what is _not_ BM25: find mode is a literal phrase scan across pages. It answers "where
does this string appear", it can be read in one sitting, and its misses are diagnosable —
the model can see which words failed to match and try different ones. If find ever needs to
be smarter, the fix is to route it through the ranking that already exists, or to make the
model issue several distinctive terms. It is not a second model.

## Layer 2: the model navigates structure

The page is captured once and split into sections at its headings. Each section gets a stable
id, a heading, and an estimated token cost. The index the model sees is roughly:

- the page handle, title and URL
- a size line: words, sections, links, tables, code blocks
- a timestamp, because the same document can legitimately be in the chat twice
- an outline: `[h4] Teams — ~28 tok`, nested by heading level
- a footer saying the page is untrusted data, and naming the tool and modes that read it

Then the model asks for what it needs. Four modes cover every case:

| Mode      | Use                                              | Cost                     |
| --------- | ------------------------------------------------ | ------------------------ |
| `outline` | Default. Decide what to read next                 | Tens of tokens           |
| `section` | One or more headings, by id or by heading text     | The section, clipped     |
| `all`     | The whole page, clipped                           | The ceiling, not the page |
| `find`    | A phrase, across every page, tagged by page        | Each match plus a slice of context |

This is why the outline's token costs are shown. A small model can compare "28 tokens" with
"1,400 tokens" and make a sensible plan; it cannot judge that from a heading name alone.

A read resolves tolerantly. The id is exact, but a heading's text — exact or even a partial
match — also works, because a model that has the outline in front of it will often quote the
heading instead of the id. Building that tolerance into the lookup is cheaper than teaching
the model a convention it will still get wrong one time in twenty.

## Section granularity

Splitting is a judgment call with a visible cost.

- Too coarse and a "section" is the whole page: the model pays for everything to read a
  paragraph, and clipping cuts the end off.
- Too fine and the outline becomes a table of contents longer than the content, and the
  model has to chain five reads to answer one question.

Aim for sections a human would name in a table of contents, and keep the numbering stable
within a capture. Ids are positional and derived from the document; they do not need to be
meaningful, they need to be consistent between the outline the model saw and the read it
asks for.

## Multi-page chats

As soon as there is more than one page, the handle is required. Guessing across pages is the
worst failure in this area: the model does not error, it answers from the wrong document,
and the answer looks exactly as confident as a correct one. Making the handle mandatory turns
an ambiguity into a question the model can ask.

The exception is a single-page chat, where the handle is unambiguous by construction. Keep
that exception narrow — it exists so one-page chats stay terse, not as a general fallback.

## What a page costs before it is read

Capture produces cleaned HTML, the page's own text, and an accessibility skeleton. The
pipeline picks a representation: Readability for articles, the skeleton for control-heavy
shells, plain text last. Then the block is rendered once and the text lives beside the chat
rather than inside it, so the transcript stays small and the history drawer stays fast.

When changing any of this, run the benchmark for the block's cost per page shape and compare.
A field that adds two tokens to the block adds two tokens to every request in that chat
forever, which is fine for a URL and not fine for a paragraph.

The budgets are explicit rather than implicit, and they are the first thing to reach for when
a block feels expensive: the block is capped at 900 tokens, the outline is clipped to 40
entries, and each heading is clipped to 72 characters. Compaction cannot shrink a block, so
these caps are the only thing standing between a heading-heavy page and a permanently
over-budget chat. Turning a cap down is a legitimate fix; adding a summarizer is not.
