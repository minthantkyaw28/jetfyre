# program.md: rules for the research agent (one page)

**Goal:** lower the mean replay cost on FD001 by editing `model.py`. Each held-out engine is
walked forward cycle by cycle and pulled the first time predicted RUL ≤ `T`.
Pulled early → cost = cycles of life thrown away. Ran to failure → cost = **500**.
Failures first, waste second. A perfect model would pull every engine one cycle before failure.

## One turn (≈1 minute)
1. **Read** `memory/insights.md`, `tail -n 15 results.tsv` and `model.py` (HEAD = current best).
2. **Hypothesise.** Write ONE line that is falsifiable and not tried before, e.g.
   *"a 30-cycle slope on the temperature sensors will warn earlier"*.
3. **Edit `model.py` only.** One idea per turn, so the verdict means something.
4. **Run** `.venv/bin/python loop.py "<hypothesis>"`. It trains on 4 folds and replays the 5th,
   5 times. Then it keeps (git commit) **only if mean cost falls AND it wins on ≥ 4/5 folds**;
   otherwise it reverts `model.py`. It logs every turn to `results.tsv`.
5. **Learn.** Append one line to `memory/insights.md`:
   `NNNN | verdict | cost new vs best | hypothesis → lesson (why it worked or failed)`.

## You MAY change (in model.py)
Features, model class and hyper-parameters, training target (e.g. cap RUL near 125), loss
(e.g. asymmetric: late errors cost more), sample weights, post-processing of predictions
(causal smoothing), and the pull threshold `T`. You may tune `T` inside `fit()` using ONLY
the training tracks you are given (an inner split by engine).

## You may NOT
- read, list, or reference `locked/`, or load any data from disk inside `model.py`;
- edit anything except `model.py` and `memory/insights.md`, or run git yourself;
- peek at the future: row *i* may use only rows ≤ *i* (no `len(track)`, no whole-track
  mean/std/min/max, no backward fill, no centred windows). The evaluator cuts tracks at
  random cycles and fails the run if earlier predictions change;
- import anything except numpy, pandas, sklearn, lightgbm, scipy and the stdlib basics;
- exceed **60 s** for a full evaluation (a loss). The baseline takes ~4 s;
- weaken or work around a guard. If a guard looks wrong, stop and say so.

## Where the wins usually are (start here, then go beyond)
- Drop the flat FD001 columns: `os3, s1, s5, s6, s10, s16, s18, s19`.
- Cap the training target at ~125: a new engine shows no wear, so it carries no signal.
- Causal rolling means / slopes / EWMA over the last 5–30 cycles; `cycle` as a feature.
- An asymmetric loss (LightGBM custom objective, or quantile alpha < 0.5) so late errors
  cost more. It teaches the model the lesson the cost teaches.
- Then trade `T` against the waste: with fewer late errors you can afford a smaller `T`.

## Reading results.tsv
`mean_cost` (lower is better), `f1..f5` per-fold cost, `wins` vs best, `fails` (engines run
to failure, should be 0), `waste` (mean cycles thrown away per pulled engine), and `rmse125` /
`nasa100`, which are diagnostics only. `verdict` is one of baseline / keep / discard / leak /
timeout / error / violation.
