# HANDOFF: read this first when you pick up the session

_Last updated: 2026-10-22 18:05 by the builder (Claude Code). Hack time: 2 h total._

## State
- [x] Repo scaffolded: harness (`prepare.py`, `evaluate.py`, `loop.py`, `final_eval.py`), `model.py`
      baseline, `program.md`, `AGENTS.md`, `CLAUDE.md`, `knowledge/`, `memory/`, `.claude/skills/`.
- [x] Data: `data/train_FD001.txt` (agent-visible). `locked/` = FD001 test+RUL, FD003 train/test/RUL.
- [x] Baseline (LightGBM on raw sensors, T=30): CV mean cost **32.84**, 0 failures, ~4 s per eval.
- [x] `final_eval.py` smoke-tested on a FAKE locked dir (scratchpad). The real `locked/` has NOT been opened.
- [ ] Research run: `scripts/autoresearch.sh 50 40` (headless, one `claude -p` per turn).
- [ ] Final eval (human says go): `.venv/bin/python final_eval.py --keeps` → `reports/final.md`.
- [ ] Fill `{{…}}` placeholders in `README.md` / `knowledge/pitch.md`; `scripts/plot_progress.py`.

## How permissions are split
- `.claude/settings.json` (everyone): deny reading or writing `locked/`.
- `.claude/research-settings.json` (headless research agent, via `--settings`) also denies
  editing the fixed harness files. Builders can edit the harness, but only between runs.
- `loop.py` guards are enforced regardless of agent: only `model.py`/`memory/`/`runs/`/`reports/` may
  change, the fixed files must match tag `harness-v1`, `model.py` imports are allowlisted and it may not
  mention locked/data files, and a causality cut-test plus a 60 s budget are applied.

## If you change the harness
Changing `evaluate.py`/`prepare.py` invalidates `results.tsv`. Re-tag `harness-v1`, delete
`best.json`, and re-run the baseline. Say so here.

## Next steps / open ideas
- Deployment demo: `predict_fleet.py` (CSV of latest snapshots → RUL + PULL/OK per engine).
- Pitch numbers: see `knowledge/pitch.md`, `knowledge/judging.md`.
