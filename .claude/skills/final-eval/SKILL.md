---
name: final-eval
description: Run the once-only locked holdout evaluation (FD001 test + FD003) and fill the final numbers into README, knowledge/pitch.md and HANDOFF.md. Use ONLY when the human explicitly says the research hour is up / run the final eval.
---

# Final evaluation — unlock `locked/` once

**Precondition:** the human has said the hour is up. If not, stop and ask. Stop any running
`scripts/autoresearch.sh` first (no research turns after the unlock — the holdout is spent).

## Steps

1. Confirm state:
   ```bash
   git status --short          # model.py must be clean (HEAD = best kept model)
   tail -n 5 results.tsv
   git log --oneline | head -10
   ```
2. Refresh the progress chart:
   ```bash
   .venv/bin/python scripts/plot_progress.py      # → reports/progress.png
   ```
3. Run the unlock **once**:
   ```bash
   .venv/bin/python final_eval.py                 # → reports/final.md
   ```
   It fits `models/baseline.py` and `model.py` on all 100 FD001 train engines and reports:
   - FD001 official test: NASA score + RMSE (last-cycle prediction vs `RUL_FD001`) — comparable to papers.
   - FD003 test: NASA score + RMSE — unseen second fault mode (fan degradation).
   - FD003 train engines (100, run-to-failure, never seen): replay cost at **C_FAIL = 250 / 500 / 1000** — shows the baseline-vs-best ranking doesn't hinge on the 500 guess.
4. Read `reports/final.md`. **Do not** re-run with tweaks — a second look at the holdout is leakage.
   If it crashed before printing results, fix only the crash (builder role), note it in `HANDOFF.md`, re-run.
5. Fill placeholders (`{{BEST_COST}}`, `{{BASELINE_COST}}`, `{{FD001_RMSE}}`, `{{FD001_NASA}}`,
   `{{FD003_RMSE}}`, `{{FD003_NASA}}`, `{{TURNS}}`, `{{KEEPS}}`, etc.) in `README.md` and
   `knowledge/pitch.md` with the real numbers. `grep -n "{{" README.md knowledge/pitch.md` to find them.
6. Update `HANDOFF.md`: final numbers, best commit, "holdout spent at <time>".
7. Honest framing: if FD003 degrades vs FD001, say so — it's still evidence (the loop learned
   wear vs. the benchmark). Never cherry-pick.
