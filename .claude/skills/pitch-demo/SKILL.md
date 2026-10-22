---
name: pitch-demo
description: How to present Jetfyre to hackathon judges — the cost curve, the git log of keeps, the final holdout table, FD003 generalisation, and the deployment story. Use when preparing slides/talk/demo or answering judge questions.
---

# Pitch & demo

Judging = 5 × 20 %: commercial value · technical design · evaluation & evidence ·
deployment/generalisation/interoperability · ease of use & communication.
Full script: `knowledge/pitch.md`. Criteria mapping: `knowledge/judging.md`.

## The story in 4 beats (≈3 min)

1. **Problem (30 s)** — Pull an engine too early: you throw away paid-for life. Too late: grounded
   aircraft and a headline. Unscheduled removals cost airlines ~$1M+ each (approx.). NASA's score
   punishes late warnings far harder than early — so does our cost.
2. **Loop (45 s)** — hypothesis → edit `model.py` → replay held-out engines cycle by cycle →
   cost = wasted cycles + 500 per failure → keep only if mean falls AND wins 4/5 folds → git commit or revert.
   ~1 turn/min on a laptop CPU.
3. **Evidence (60 s)** — show, in this order:
   - `reports/progress.png` — cost per turn, keeps highlighted, running best line.
   - `git log --oneline` — every keep is a commit with its hypothesis as the message.
   - `results.tsv` — every attempt, including rejected ones (honesty: most ideas fail).
   - `reports/final.md` — baseline vs best on **locked** FD001 test (NASA score + RMSE, comparable to papers),
     FD003 (unseen fan-degradation fault mode), and replay at C_FAIL 250/500/1000 (ranking robust).
4. **Deployment (45 s)** — CSV/EHM snapshot in → per-engine RUL + PULL/KEEP out; fits existing MRO
   planning. Loop reruns as fleet data grows; a human approves each promotion (the keep commit is the audit trail).

## Live demo runbook

```bash
tail -n 10 results.tsv | cut -f1,3,4,10,11,15      # turn, hypothesis, mean, fails, waste, verdict
git log --oneline | head -10
.venv/bin/python loop.py "demo: T 30 -> 25"         # one live turn (~10-30 s), shows guard + verdict
open reports/progress.png reports/final.md
```
Have a pre-recorded fallback (screenshot of progress.png + final.md) in case the live turn is slow.

## Anticipated judge questions

- *Leakage?* Folds by engine (rows are near-copies), causality guard (random cut, predictions before cut must not change), locked holdout opened once, `model.py` can't touch disk/network, fixed-file hashes checked.
- *Overfitting the CV?* 4/5-fold rule; final numbers on never-seen FD001 test + FD003 with a new fault mode.
- *Why 500?* > any FD001 engine's full life, so letting engines fail can never win; sensitivity shown at 250/1000.
- *Real data?* C-MAPSS is simulated; same harness takes real EHM data — only `prepare.py` changes.
