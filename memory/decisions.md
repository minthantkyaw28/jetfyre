# Design decisions (and why)

Durable choices behind the harness. Changing any of these invalidates prior `results.tsv` rows.

1. **Folds by engine, never by row.** FD001 train = 100 run-to-failure engines → 5 folds × 20 (seed 0).
   Consecutive rows of one engine are near-copies; a row split lets the model memorise the engine
   and reports fantasy accuracy.
2. **Cost = what an airline pays.** Replay each held-out engine cycle by cycle; pull at the first cycle
   predicted RUL ≤ `T`. Early pull costs the remaining true life (C_CYCLE = 1 per cycle wasted).
   Running to failure costs **C_FAIL = 500** — more than any FD001 engine's whole life (max ≈ 362),
   so letting engines fail can never beat pulling. Reads as *failures first, waste second*.
3. **Keep rule: mean cost falls AND wins ≥ 4/5 folds.** One lucky fold can't carry a change; guards
   against noise-chasing over ~30 turns.
4. **Causality guard.** Before scoring, each track is cut at a random cycle; predictions before the cut
   must be unchanged. Catches centered windows, whole-track normalisation, `len(track)` tricks.
   This makes one `predict(full_track)` call equivalent to walking forward one cycle at a time.
5. **Locked holdout.** Official FD001 test + all of FD003 sit in `locked/`; agents never open it
   (settings.json deny + `loop.py` source checks). `final_eval.py` opens it once, human-triggered.
6. **FD003 as the generalisation test.** Same single operating condition as FD001 but adds a second
   fault mode (fan degradation) the loop never saw. If the model holds there, it learned wear, not the benchmark.
   FD003 train engines (run-to-failure) give a true replay; FD003 test gives paper-comparable score/RMSE.
7. **Sensitivity of C_FAIL.** Final replay at 250 / 500 / 1000 shows the baseline-vs-best ranking
   doesn't hinge on one cost guess.
8. **Git keep/revert.** `loop.py` commits kept changes (message = hypothesis) and checks out `model.py`
   on reject; every attempt's diff is saved to `runs/`. HEAD is always the best model; the log is the audit trail.
9. **60 s budget per run.** Over budget = loss. Keeps the loop at ~1 turn/min on a laptop CPU (~30 turns/hour).
10. **One editable file.** `model.py` holds features, model, loss and `T` — small, attributable diffs.
