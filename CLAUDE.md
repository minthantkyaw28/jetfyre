# CLAUDE.md

**`AGENTS.md` is the source of truth** — roles, fixed-vs-editable files, hard rules, memory and
handoff protocols. Read it first, then `HANDOFF.md`. If you are the research agent, also `program.md`.

Claude Code specifics:

- **Python:** always `.venv/bin/python` (3.12, numpy/pandas/sklearn/lightgbm/matplotlib). Never system `python3`.
- **Skills** in `.claude/skills/`:
  - `autoresearch-turn` — one research turn (hypothesis → edit `model.py` → `loop.py` → insight).
  - `final-eval` — only when the human says the hour is up; unlocks `locked/` once.
  - `pitch-demo` — how to present results to judges.
- **Memory lives in the repo** (`memory/`), not in `~/.claude`. Index: `memory/MEMORY.md`.
  Per-turn lessons → `memory/insights.md`; design decisions → `memory/decisions.md`.
- **Permissions:** `.claude/settings.json` denies reading `locked/` for every session; headless research
  turns (`scripts/autoresearch.sh`) also load `.claude/research-settings.json`, which denies editing the
  fixed harness. Don't try to work around a deny — it's a guard, not an obstacle.
- **Git:** during research only `loop.py` commits/reverts. Don't commit `model.py` by hand.
- **Before ending a session:** update `HANDOFF.md` (best turn/cost/commit, what's running, next steps).
