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

## Web UI (JetFyre dashboard) — live at https://jetfyre.vercel.app
- Source: `web/` (Vite + React 19 + react-three-fiber + Tailwind v4). Vercel project `jetfyre` (linked in `web/.vercel`, gitignored; `web/.env.local` holds a Vercel OIDC token and is gitignored).
- Left: procedural 3D fleet (A380, 747-8, 777-300ER, A350, A320neo) with per-engine status labels; click an engine → camera flight + spotlight + dossier. Self-running tour (`store.ts: startTourDriver`): plane intro → zoom on its most severe engine → zoom out → next plane; pauses on interaction, resumes after 30 s.
- Right: autoresearch cluster (5-stage loop, agents, fold bars, verdict, cost curve) + Managed-Agents-style observability (sessions, event trace). The GE90-class (777) family replays the REAL run from `results.tsv`; the other four families are labelled SIMULATED.
- Refresh real data + deploy: `cd web && node scripts/export-run.mjs && npx vite build && npx -y vercel@latest deploy --prod --yes` (global vercel CLI 33 is too old; use npx).
- Design decision (user): navy chrome + deep-blue studio + white jets, compact engine labels.
- `predict_fleet.py` (deployment shim, not yet run): fleet snapshot file → `reports/pull_list.csv` with PULL / WATCH / OK per engine.
- Pitch deck: `When to Pull an Engine.pdf`; transcript + slide-8 number map in `knowledge/deck.md`.
