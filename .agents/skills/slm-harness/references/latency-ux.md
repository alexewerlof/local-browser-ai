# Showing a slow model without lying about it

Local generation is slow enough that the interface is doing real work: for thirty seconds
the only thing the user has is what the panel says. That makes honesty the design principle —
the panel should always make clear (a) what is happening, (b) whether it is making progress,
and (c) whether it is waiting on the user.

## Two surfaces, and they are different

**Thinking is a single collapsed line.** While reasoning streams, it reads "Thinking…". When
it finishes the same line becomes "Thought process" with elapsed time and a token count, and
opens on demand. One line, always present, never open by default: a reasoning trace is worth
having and not worth reading every time.

**Acting is a list of actions, not a log.** Each tool call is one row in prose — "Reading
page", "Searching the web", "Searching memory", "Saving to memory", "Checking the clock",
"Reading selection" — with:

- a state badge in the user's words: waiting, running, done, failed, denied
- a short argument summary, so the row says _what_ it is reading, not just that it is reading
- a disclosure that opens the exact input and output payloads
- the approval buttons inline when the action needs consent
- for a remote tool, its server name, so the user knows where the data went

Labels are prose, and they are the only place a tool's identity is explained. The enum value
never reaches the screen. When a tool is added, its label is part of the work — "Reading page
(h4)" is a sentence, `read_page` is not.

## What to hide

The harness's own bookkeeping does not belong in the transcript: token estimation, memory
injection, outline construction, cache decisions. Those are not events the user can act on,
and narrating them trains the user to ignore the feed.

The one exception is compaction, because it changes the transcript visibly. It belongs in the
context meter: its own segment, a threshold marker, and a manual way to trigger it. A user
who sees the summary appear should be able to find out why.

## What to show even when it is ugly

- **Truncation.** If an output was clipped, the card says so and shows where. The user is
  about to ask "why did it miss the last paragraph"; answer it before the question.
- **Waits on the user.** When the run cannot proceed without a grant or an approval, put the
  control on the row and say so in one sentence. A stalled model and a waiting user must not
  look the same.
- **Failures.** "Action failed" with the reason in plain language, on the row, with what
  happens next. Never a silent row that stays "running", and never a raw provider payload as
  the only explanation.
- **Cost.** A live meter of the window, broken down by contributor, with the threshold marked,
  plus elapsed time to first token, total duration and output tokens per answer. This is the
  only honest answer to "why is it slow", so it should be visible without a settings trip.

## Wording

Wording is where most of the felt quality of the panel lives, and it is also where the
ontology applies: one term per concept, the same term everywhere.

- Say what is happening in the present tense and the user's vocabulary. "Reading page" while
  it runs, "done" after.
- Never imply more progress than exists. No fake percentages, no animated bars that fill on a
  timer, no "almost there".
- An empty state names the next action: there is nothing here yet, and here is how to start.
- A denial is not an error. "Denied" and "failed" are different rows with different next steps.
- Anything the model may have written is rendered as text, never as markup that executes.

## Motion and layout

- The transcript scrolls; the composer stays. A long run must not push the input out of reach.
- Streaming text should not reflow the whole panel every token. Keep the growing region
  stable and let it extend downward.
- The panel is narrow by design. Prefer a row that collapses over a modal that covers the
  conversation; a confirmation that hides the thing being confirmed is a worse experience
  than eight extra words on the row.
- Anything that expands should keep its scroll position and its state while the rest of the
  transcript updates around it.

## Reviewing a UI change

Ask:

1. If this were the only thing on screen for forty seconds, would the user know it is working?
2. Does every in-progress row have a state the user can read without hovering?
3. Is there any state where the panel is waiting for the user and does not say so?
4. Did any internal pipeline stage leak into the transcript?
5. Does anything claim progress it cannot know?
