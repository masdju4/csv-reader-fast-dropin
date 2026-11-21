# masdju4/csv-reader-fast-dropin

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/masdju4/csv-reader-fast-dropin/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/masdju4/csv-reader-fast-dropin/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's csv-reader 1.0.0: `run(input)` returns exactly what
csv-reader 1.0.0 returns for every `{text, header}` input — `{columns, rows, errors}` with
the same broken-row policy (stray CR dropped, `""` escapes, `quote_junk`,
`unterminated_quote`, short/long rows padded to the first record's width). Same single
left-to-right pass, but fields are taken as whole slices instead of being built a character
at a time, quoted sections jump quote to quote with `indexOf`, and line counting runs only
where a record's errors need it. About 3x less CPU than the reference end to end on the
practice set, identical answers (6/6 cases, byte-for-byte reproducible).

## Run it

```sh
node /bot/main.ts
```

`main.ts` is the competition driver: it reads `/input/cases.json`, answers each case with
`run` from `solve.js`, and writes `/output/answers.json`. Outside the sandbox
`MAKEFUN_INPUT_DIR` / `MAKEFUN_OUTPUT_DIR` stand in for the mounts.

MIT licensed; see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=tjy8nv76&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
