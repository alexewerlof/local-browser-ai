# Page representation benchmark

`npm run bench` prints, for four representative pages built in `context.bench.ts`, how many tokens each way of
describing the page costs and whether the fact a user would ask about is still reachable.

| Row                                 | What it measures                                                     |
| ----------------------------------- | -------------------------------------------------------------------- |
| `raw html (source)`                 | The fixture markup before extraction.                                |
| `cleaned html (clone)`              | What the injectable extractor sends back to the panel.               |
| `plain text (innerText)`            | The page's own text. jsdom reports nothing, so it reads `jsdom n/a`. |
| `aria skeleton`                     | Roles, names and states derived from the live DOM.                   |
| `captured page`                     | What `processExtraction` picked (article / app / text).              |
| `page block (what the prompt gets)` | The frozen block `freezePage` renders once and stores.               |
| `tools can reach the marker`        | Whether `find_in_page` still finds the fact through the page tools.  |
| `re-rendered block (must match)`    | A second render of the same snapshot; a difference breaks the cache. |

Reading the output:

- The **page block** row is the one that matters: it is what every added page costs in the conversation, forever. It
  should stay around a hundred tokens whatever the page size.
- The block deliberately carries no page text, so its `marker` is `NO` — that is correct, and it is why the
  `tools can reach the marker` row exists. A page where both rows say `NO` cannot be answered from.
- The two block rows must be identical: the block is rendered at capture time and never again, so a re-render that
  differs means the layout depends on something it must not (a query, the clock, the model).
- Extraction still has to keep the text: an empty `captured page` row with a missing marker leaves the tools nothing to
  read.

Fixture set (keep one per page shape when adding cases):

1. **article** — long prose behind a nav and footer.
2. **docs** — 60-item sidebar, code block, 12-row table.
3. **dashboard** — no prose, only controls, checkboxes and lists.
4. **product** — price, review list, related-products grid.
