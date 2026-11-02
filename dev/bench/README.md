# Page representation benchmark

`npm run bench` prints, for four representative pages built in `context.bench.ts`, how many tokens each way of
describing the page costs and whether it still contains the fact a user would ask about.

| Row                               | What it measures                                                     |
| --------------------------------- | -------------------------------------------------------------------- |
| `raw html (source)`               | The fixture markup before extraction.                                |
| `cleaned html (clone)`            | What the injectable extractor sends back to the panel.               |
| `plain text (innerText)`          | The page's own text. jsdom reports nothing, so it reads `jsdom n/a`. |
| `aria skeleton`                   | Roles, names and states derived from the live DOM.                   |
| `chosen representation`           | What `processExtraction` picked (article / app / text).              |
| `prompt with tools`               | What `choosePageMode` actually puts in the prompt by default.        |
| `prompt without tools`            | The fallback when the model cannot call tools.                       |
| `index only` / `index + excerpts` | The index alone, and the index with BM25 excerpts appended.          |

Reading the output:

- The **prompt** rows are the ones that matter. A row that is large but not used costs nothing.
- `marker` must be `yes` for a representation to be usable; a cheap representation that drops the answer is worse than
  an expensive one that keeps it.
- Small pages fall back to `full` on purpose: below ~400 tokens an index is pure overhead.

Fixture set (keep one per page shape when adding cases):

1. **article** — long prose behind a nav and footer.
2. **docs** — 60-item sidebar, code block, 12-row table.
3. **dashboard** — no prose, only controls, checkboxes and lists.
4. **product** — price, review list, related-products grid.
