# Our idea: autoresearch for jet engine maintenance

> Early is wasted engine life. Late is a grounded aircraft and a headline.

NASA's C-MAPSS data runs simulated turbofans to failure. It ships with a score that punishes late warnings far harder than early ones. The agent edits two things: the remaining-life (RUL) model and the threshold for pulling an engine. The evaluator applies the score to engines the agent never saw, and then to a harder subset with two fault modes.

## The loop

**hypothesis → edit → run → score → keep or revert.** Each turn takes about a minute on a laptop CPU and is scored against engines the agent is never allowed to train on.

## What the agent may and may not touch

| File | Status | Contents |
|---|---|---|
| `prepare.py` | FIXED | Loads FD001: 100 training engines, each run from new to failure. It cuts them **by engine** into 5 folds of 20, never by row. Rows from one engine are near copies of each other, so a row split lets the model memorise the engine. |
| `evaluate.py` | FIXED | The scorer and the costs. |
| `model.py` | **EDITABLE** | Features, model, loss, and the pull threshold `T`. |
| `program.md` | FIXED | One page of plain rules: what the agent may change, what it may not read, and how to log. |
| `locked/` | NEVER OPENED by the agent | The official FD001 test set and all of FD003. |

## One turn

1. Read the log of past runs (`results.tsv`).
2. Write a one-line hypothesis, e.g. *"a 30-cycle slope on the temperature sensors will warn earlier"*.
3. Edit `model.py`.
4. Run the evaluator. It trains on 4 folds and replays the 5th, five times over.
   - **Replay** walks each held-out engine forward one cycle at a time, the way an airline would live it. It pulls the engine the first time the predicted life falls to `T` or below.
   - A **pull** costs the cycles of life thrown away.
   - A **failure** costs 500 cycles, which is more than any engine's whole life. The agent can never win by letting engines fail. The score reads as *failures first, waste second*, which is how an airline thinks.
5. **Keep** the change with a git commit only if the mean cost falls **and** it wins on at least 4 of 5 folds. Otherwise `git reset`.
6. Either way, the hypothesis, fold costs and verdict go into `results.tsv`.

```python
import numpy as np

C_CYCLE, C_FAIL = 1.0, 500.0  # assumption: a failure costs 500 cycles of life

def nasa_score(pred, true):
    d = pred - true  # d > 0 means the warning came late
    return np.sum(np.where(d < 0, np.exp(-d / 13) - 1, np.exp(d / 10) - 1))

def replay_cost(model, tracks, T):
    cost = 0.0
    for X in tracks:  # one engine, new to failure
        life = len(X)
        rul = life - np.arange(1, life + 1)  # true cycles left
        pred = model.predict(X)  # one guess per cycle
        hit = np.flatnonzero(pred <= T)
        if hit.size and rul[hit[0]] > 0:
            cost += C_CYCLE * rul[hit[0]]  # pulled early: wasted life
        else:
            cost += C_FAIL  # ran to failure
    return cost / len(tracks)

def keep(new, best):  # per-fold costs, lower wins
    new, best = np.array(new), np.array(best)
    return new.mean() < best.mean() and (new < best).sum() >= 4
```

## Three anti-cheating guards

1. **Causality check.** Before scoring, the evaluator cuts each track at a random cycle and checks that the predictions before the cut do not change. This catches any feature that peeks at the future.
2. **Locked files.** The agent cannot edit `evaluate.py` or read `locked/`. A run over 60 seconds counts as a loss.
3. **The 4-of-5 rule.** One lucky fold cannot carry a change.

## Expected trajectory

- **Baseline (turn 0):** a gradient-boosted model on raw sensors, with `T = 30`.
- The usual winners after that:
  - rolling means and slopes over recent cycles
  - dropping the sensors that never move in FD001
  - **capping the training target near 125 cycles**, because a new engine shows no wear and so carries no signal
  - a **loss that charges late errors more than early ones**, which teaches the model the same lesson the cost does

## End of the hour: open the locked folder once

1. Score the best model on the **official FD001 test** with NASA's asymmetric score and RMSE, so judges can set it beside published papers.
2. Score it on the **FD003 test engines**, which add a second fault mode the loop never saw.
3. Rerun the replay with **failure at 250 and 1,000 cycles** to show the ranking does not hang on one guess.

At about a minute a turn, an hour buys around **30 turns**. **If the model holds on FD003, the loop learned wear, not the benchmark.**
