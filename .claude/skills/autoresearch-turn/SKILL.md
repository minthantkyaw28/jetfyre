---
name: autoresearch-turn
description: Do exactly ONE Jetfyre autoresearch turn — read memory and results.tsv, pick an untried hypothesis, edit model.py only, run loop.py, append one insight. Use whenever asked to run a research turn / iterate on the RUL model.
---

# One autoresearch turn

You are the **research agent**. Rules: `program.md` + `AGENTS.md`. You edit **only `model.py`**.
You never open `locked/`, never touch git, never edit the fixed harness. One turn ≈ 1 minute.

## 1. Orient (≤ 15 s)

```bash
tail -n 15 results.tsv
git log --oneline | head -5
```
Read `memory/insights.md` and `model.py` (HEAD = current best). Note: best mean cost, which folds
it loses on, fails vs waste split. **Failures dominate cost (500 each)** — if `fails > 0`, the
next move is almost always "warn earlier"; if `fails == 0`, the next move is "waste less".

## 2. Pick ONE hypothesis

Not already in `insights.md` / `results.tsv` (or materially different — say how). One line,
falsifiable, says *why* it should lower cost. Prefer small, attributable edits.

### Idea bank (roughly in order of expected payoff on FD001)

- **Drop flat sensors** (FD001: s1, s5, s6, s10, s16, s18, s19 and os3 barely move) — less noise.
- **RUL cap 115–135** on the training target (new engines show no wear → no signal). Try 125 first.
- **Rolling mean / slope** of informative sensors over windows 5 / 10 / 20 / 30 (causal: `rolling(w, min_periods=1)` within the track only).
- **EWMA** of sensors (`ewm(span=…, adjust=False)`) — causal smoothing.
- **Cycle as a feature** (current `cycle` is known at time t — legit).
- **Operating-setting normalisation** (subtract per-setting baseline learned in `fit`, never from the test track's future).
- **Asymmetric loss**: LightGBM custom objective charging late errors (pred > true) more, or quantile loss `alpha` 0.30–0.45 → conservative predictions.
- **Tune `T`** in 10–40 (or pick `T` inside `fit` via inner CV on the *training* folds only).
- **Monotone smoothing of predictions**: causal `np.minimum.accumulate` or EWMA over the prediction series — kills noisy dips/rises.
- **Ensembles**: average 2–3 models (e.g. LGBM + Ridge on rolled features).
- **LightGBM params**: `num_leaves`, `min_child_samples`, `learning_rate`/`n_estimators`, `feature_fraction`, `reg_lambda`.
- **Per-engine baseline offset**: subtract the mean of the first k cycles of *this* track (causal once k cycles have passed; before that use what's available).

### Causality checklist (the guard will catch you anyway)
- No `len(track)`, no `track[col].mean()/max()/std()` over the whole track, no `shift(-k)`, no centered windows, no bfill.
- Everything computed in `predict` must give identical row-i output if rows > i were deleted.

## 3. Edit `model.py`

Minimal diff. Keep `T` and the `Model.fit/predict` contract. Keep runtime well under 60 s for 5 folds
(prefer LightGBM / HistGradientBoosting, ≤ ~500 trees, no deep nets).

## 4. Run the turn

```bash
.venv/bin/python loop.py "your one-line hypothesis"
```
`loop.py` guards, evaluates, keeps (commit) or reverts (checkout), logs to `results.tsv` and
`runs/NNNN_<verdict>.diff`. **Do not** re-run to fish for a better number. **Do not** touch git.

## 5. Record the insight

Append exactly one line to `memory/insights.md`:
```
- T0007 | rolling slope w=20 on T50/Ps30 → keep (mean 41.2 vs 44.0, wins 4/5) | slopes warn earlier; fails 3→1
```
Then stop. The next turn starts fresh.
