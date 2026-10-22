# Agent rules

You are improving `model.py`, which decides when to pull jet engines for removal.

## The score
- The score is the mean cost per engine. Lower is better.
- A pull costs the cycles of life thrown away (1 per cycle). A failure costs 500.
- The engine is pulled at the first row where predicted life <= T.

## Rules
1. Edit only `model.py`. Never edit any other file.
2. Never open, list or read anything in `sealed/`.
3. Never hardcode anything about specific engine ids.
4. Never use rows after the current row. `predict(track)[i]` may use rows 0..i only. The evaluator checks this.
5. Keep every random seed fixed.

## Each turn
1. Read `results.tsv`.
2. Choose one change. One idea per turn, so the log shows what worked.
3. Make it in `model.py`.
4. Run `python loop.py "<one-line hypothesis>"`.

A change is kept only if the mean cost drops and at least 4 of 5 folds improve. Otherwise `model.py` is reverted.

## Directions worth trying
- Rolling means and slopes over recent cycles (backward-looking windows only).
- Dropping sensors that never change.
- The life cap.
- A loss or sample weighting that punishes late predictions more than early ones.
- T.

## When things go wrong
- If a turn errors, read the error, fix `model.py` and run again.
- After three reverts in a row, change direction.

## Stopping
Stop after 30 turns or when told.
