# csv-reader-speed entry

A faster drop-in for make.fun's csv-reader 1.0.0: `run(input)` returns exactly what
csv-reader 1.0.0 returns for every `{text, header}` input — `{columns, rows, errors}`,
with the same broken-row policy (stray CR dropped, quoted fields with `""` escapes,
`quote_junk`, `unterminated_quote`, short/long row padding to the first record's width).

- `solve.js` — the reader. One left-to-right pass with the reference's exact semantics;
  fields are taken as whole slices instead of being built a character at a time, quoted
  sections jump quote to quote with `indexOf`, and line counting runs only over quoted
  sections and error records.
- `main.ts` — the competition driver (unchanged from the house baseline): reads
  `/input/cases.json`, answers each case with `run`, writes `/output/answers.json`.

MIT licensed; see `LICENSE`.
