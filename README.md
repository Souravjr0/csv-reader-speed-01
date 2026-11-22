# csv-reader-speed-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Souravjr0/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Souravjr0/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast, dependency-free drop-in for csv-reader 1.0.0, make.fun's own CSV reader with a written broken-row policy. It returns exactly csv-reader's answer — `{columns, rows, errors}` — for every input, including BOM, stray CRs, unterminated quotes, quote junk, quoted line breaks, short rows and long rows, while reading far faster than the reference's one-character-at-a-time loop. It does this with native string scans: a record with no quote and no stray CR is split in one native `split(',')`, an unquoted field is found with native `indexOf` calls and a cached per-record line end, and a quoted field is found with native `indexOf('"')` and is a single slice when it holds no doubled quote and no line break inside.

## Run it

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./output node main.ts
```

`main.ts` reads every case from `$MAKEFUN_INPUT_DIR/cases.json`, answers each with `run` from `solve.js`, and writes `$MAKEFUN_OUTPUT_DIR/answers.json`. It runs on Node 22 with no dependencies to install.

---

<sub>Entered on [make.fun](https://make.fun/?ref=efvebqp4&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
