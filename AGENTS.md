# AGENTS.md — source of truth for every agent in Jetfyre

Jetfyre is a **verifiable autoresearch** loop for jet-engine maintenance on NASA C-MAPSS.
An agent edits one file (`model.py`: features, model, loss, pull threshold `T`); a fixed
evaluator replays held-out engines cycle by cycle and charges **wasted life** for early pulls
and **500 cycles** for a failure. Changes are kept (git commit) only if they win; otherwise reverted.

There are two roles. Know which one you are before you touch anything.

---

## Role A — RESEARCH agent (the autoresearcher)

You follow `program.md` and the `autoresearch-turn` skill. One turn = one hypothesis.

- You edit **only `model.py`**. Nothing else, ever, during a research run.
- You run **`.venv/bin/python loop.py "one-line hypothesis"`**. It decides keep/revert — not you.
- You never `git commit`, `git reset`, or `git checkout` yourself. `loop.py` owns git.
- You never open `locked/` (FD001 test, all of FD003). Not to peek, not to "check format".

## Role B — BUILDER agents (harness maintainers)

You maintain the harness, docs, skills and demo. You may edit fixed files **only when no
research run is active**, and any change to `evaluate.py` / `prepare.py` invalidates prior
results (re-baseline and say so in `HANDOFF.md`). Builders also never open `locked/`;
only `final_eval.py`, triggered by the human, reads it — once.

---

## Fixed vs editable

| File | Who may edit | Purpose |
|---|---|---|
| `model.py` | **Research agent** | `T` (pull threshold), `class Model` with `fit(tracks)` / `predict(track)` |
| `program.md` | Builder | One-page rules for the research agent |
| `prepare.py` | FIXED | Loads FD001 train, 5 folds × 20 engines **by engine** → `data/folds.json` |
| `evaluate.py` | FIXED | Costs, `nasa_score`, `replay_cost`, causality guard, 60 s budget, JSON summary |
| `loop.py` | FIXED | One turn: guards → evaluate → keep (commit) / revert → `results.tsv`, `runs/` |
| `final_eval.py` | FIXED | Human-triggered, once-only unlock of `locked/` → `reports/final.md` |
| `models/baseline.py` | FIXED | Frozen copy of the turn-0 model for the final comparison |
| `locked/` | **Nobody reads** | FD001 test + RUL, FD003 train/test/RUL |

### `model.py` contract

```python
T: float                       # pull the engine the first cycle predicted RUL <= T
class Model:
    def fit(self, tracks: list[pd.DataFrame]) -> None: ...   # every track ends at failure
    def predict(self, track: pd.DataFrame) -> np.ndarray: ... # one RUL guess per row
```
Track columns: `unit, cycle, os1, os2, os3, s1..s21`. Predictions must be **causal**:
row *i* may use only rows ≤ *i* (rolling windows, EWMA, cummin — never whole-track stats,
never `len(track)`). The evaluator cuts tracks at random cycles and fails the run if any
earlier prediction changes.

---

## Hard rules (violations = loss + revert, and they are logged)

1. **Never read `locked/`** — no `cat`, `head`, `open()`, `pd.read_*`, `cp`, glob, nothing.
2. **Never edit** `evaluate.py`, `prepare.py`, `loop.py`, `final_eval.py` during a research run
   (`loop.py` hash-checks them).
3. **Never train on held-out folds.** `fit()` gets exactly the four training folds; don't load
   data from disk inside `model.py`.
4. **Causality.** No future peeking; no features from track length or whole-track statistics.
5. **Budget.** A full evaluate run over **60 s** counts as a loss. Keep models laptop-CPU fast.
6. `model.py` may not import/use `subprocess`, `socket`, `os.system`, network libs, or mention `locked`.
7. Never weaken a guard to make a number look better. If a guard is wrong, stop and tell the human.

## Keep rule (from `evaluate.py`)

Keep iff **mean fold cost falls** AND the change **wins on ≥ 4 of 5 folds**. One lucky fold
cannot carry a change. Score reads as *failures first, waste second*.

---

## Repo map

```
AGENTS.md  CLAUDE.md  HANDOFF.md  README.md  program.md
prepare.py  evaluate.py  loop.py  final_eval.py   # fixed harness
model.py                                          # the only research-editable file
models/baseline.py                                # frozen baseline
data/train_FD001.txt  data/folds.json             # agent-visible data
locked/                                           # holdout — never opened by agents
results.tsv                                       # one row per turn
runs/NNNN_<verdict>.diff                          # every attempted change, kept or not
reports/                                          # progress.png, final.md
knowledge/                                        # static reference (brief, dataset, judging, pitch)
memory/                                           # cross-turn agent memory (MEMORY.md index)
.claude/skills/                                   # autoresearch-turn, final-eval, pitch-demo
scripts/autoresearch.sh                           # headless loop: one fresh claude -p per turn
scripts/plot_progress.py                          # results.tsv → reports/progress.png
```

## Commands

```bash
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python prepare.py                       # once: builds data/folds.json
.venv/bin/python evaluate.py                      # dry run, prints JSON, no keep/revert
.venv/bin/python loop.py "hypothesis in one line" # one research turn
tail -n 15 results.tsv                            # recent history
git log --oneline                                 # kept changes
scripts/autoresearch.sh 60 40                     # headless loop: 60 min, ≤40 turns
.venv/bin/python scripts/plot_progress.py         # reports/progress.png
.venv/bin/python final_eval.py                    # HUMAN ONLY, once, when the hour is up
```

---

## Memory protocol (research agent, every turn)

**At turn start** read:
1. `memory/MEMORY.md` (index) and `memory/insights.md` (what's been learned),
2. the last 15 rows of `results.tsv`,
3. `model.py` (current best — HEAD is always the best kept model).

**At turn end** append exactly one line to `memory/insights.md`:
```
- T0007 | hypothesis → verdict (mean 41.2 vs best 44.0, wins 4/5) | lesson in one clause
```
Don't repeat a hypothesis that's already in `insights.md`/`results.tsv` unless you change it
materially and say how. Durable design decisions go in `memory/decisions.md` (builders).

## Handoff protocol

`HANDOFF.md` is the baton. Before ending any session (builder or long research run), update it:
current best (turn, mean cost, commit), what's running, what's next, known issues, time left.
Read it first when you start.
