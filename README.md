# Jetfyre: verifiable autoresearch for jet engine maintenance

**Early is wasted engine life. Late is a grounded aircraft and a headline.**

Jetfyre is an autoresearch loop for deciding when to pull a jet engine. An AI agent edits one file, `model.py`, which holds the remaining-useful-life (RUL) model and the pull threshold `T`. A fixed evaluator replays held-out NASA C-MAPSS turbofans cycle by cycle, the way an airline would live it, and charges for every cycle of life thrown away plus **500 cycles per failure**. A change is kept with a git commit only if the mean cost falls **and** it wins on at least 4 of 5 engine folds. Otherwise it is reverted. At the end, a locked holdout is opened once: the official FD001 test, and FD003, which adds a **second fault mode the loop never saw**. If the model holds there, the loop learned wear, not the benchmark.

Built for the Moonfire Ventures Hack, "Autoresearch for Real-World Value". The brief is in `knowledge/hack-brief.md`.

## The loop

```
        ┌──────────────────────────────────────────────────────────────┐
        │                                                              │
        ▼                                                              │
  read results.tsv  ──►  one-line HYPOTHESIS  ──►  EDIT model.py       │
  + memory/insights.md                              (features, model,   │
                                                     loss, threshold T) │
                                                          │            │
                                                          ▼            │
                          python loop.py "hypothesis"                  │
                          ├─ guard: only model.py changed, fixed files │
                          │         hash-checked                       │
                          ├─ evaluate.py: train on 4 folds, REPLAY 5th │
                          │   × 5 folds (by engine), causality check,  │
                          │   60 s budget                              │
                          └─ cost = wasted cycles + 500 × failures     │
                                                          │            │
                                   mean ↓ AND wins ≥ 4/5 folds?        │
                                    ┌──────────┴──────────┐            │
                                  YES                     NO           │
                              git commit             git checkout      │
                              (new best)             model.py          │
                                    └──────────┬──────────┘            │
                                               ▼                       │
                              append to results.tsv, save runs/NNNN.diff ┘

  After ~1 hour (~30 turns):  python final_eval.py
     → opens locked/ ONCE: FD001 test (RMSE + NASA score), FD003 test,
       FD003 replay at C_FAIL = 250 / 500 / 1000, baseline vs best
```

## Fixed vs editable

| File | Who may edit | Role |
|---|---|---|
| `prepare.py` | nobody (fixed) | Loads FD001 train (100 run-to-failure engines). Splits **by engine** into 5 folds of 20 (seed 0) and writes `data/folds.json` |
| `evaluate.py` | nobody (fixed) | Costs (`C_CYCLE=1`, `C_FAIL=500`), `nasa_score`, `replay_cost`, the keep rule, the causality guard and the 60 s budget. Prints JSON |
| `loop.py` | nobody (fixed) | One turn: guard check, evaluate, keep (commit) or revert, log |
| `final_eval.py` | nobody (fixed) | One-time unlock of `locked/` |
| **`model.py`** | **the agent** | Features, model, loss, pull threshold `T` |
| `program.md` | nobody (fixed) | The agent's one-page rules |
| `locked/` | **never opened** by the agent | FD001 test + RUL, and all of FD003 |

## Guards against cheating

1. **Fold by engine, never by row.** Rows from one engine are near copies of each other.
2. **Causality check.** Each track is cut at a random cycle, and predictions before the cut must not change. This catches any feature that peeks at the future.
3. **Locked scorer and holdout.** Fixed files are hash-checked, only `model.py` may change, and `locked/` is denied.
4. **Time budget.** A run over 60 s counts as a loss.
5. **The 4-of-5 rule.** One lucky fold cannot carry a change.

## Quickstart

```bash
uv venv --python 3.12 .venv && uv pip install -r requirements.txt
source .venv/bin/activate

python prepare.py                    # writes data/folds.json
python loop.py "baseline"            # turn 0: GBM on raw sensors, T=30

# then, each turn: edit model.py, and
python loop.py "30-cycle slope on temperature sensors warns earlier"

# headless agent loop (fresh context per turn)
bash scripts/autoresearch.sh

# at the end, once:
python final_eval.py
```

## Repo map

```
README.md          this file
CLAUDE.md          instructions for Claude Code (builder + research agent)
AGENTS.md          instructions for any coding agent
HANDOFF.md         current state / next steps for whoever picks this up
program.md         the research agent's one-page rules
prepare.py         FIXED: data load + 5 engine folds
evaluate.py        FIXED: scorer, costs, replay, guards
loop.py            FIXED: one autoresearch turn (keep/revert + log)
final_eval.py      FIXED: one-time locked holdout evaluation
model.py           EDITABLE: features, model, loss, T
models/baseline.py frozen copy of the turn-0 model
results.tsv        every turn: hypothesis, 5 fold costs, verdict
runs/              per-turn diffs (kept and discarded)
data/              FD001 train (agent-visible)
locked/            FD001 test + FD003 (agent never opens)
knowledge/         hack brief, idea, dataset facts, judging map, pitch
memory/            the research agent's cross-turn memory (insights.md)
scripts/           autoresearch.sh (headless claude -p loop)
.claude/skills/    autoresearch-turn, final-eval, pitch-demo
```

## Results

_Filled in after the run. See `knowledge/pitch.md` for the full table._

| | Baseline | Best |
|---|---|---|
| CV replay cost (cycles/engine) | TBD | TBD |
| CV failures | TBD | TBD |
| FD001 test RMSE / NASA score | TBD | TBD |
| FD003 test RMSE / NASA score (unseen fault mode) | TBD | TBD |
| FD003 replay @ C_FAIL 250 / 500 / 1000 | TBD | TBD |

Turns run: TBD · kept: TBD · reverted: TBD

## Data

NASA PCoE Turbofan Engine Degradation Simulation (C-MAPSS). Saxena et al., *Damage Propagation Modeling for Aircraft Engine Run-to-Failure Simulation*, PHM08. Dataset facts are in `knowledge/cmapss.md`.
