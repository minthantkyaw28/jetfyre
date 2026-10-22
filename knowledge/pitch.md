# Pitch: 3 minutes, plus the demo runbook

Fill in the `{{…}}` placeholders after `final_eval.py` runs. The source numbers are in `results.tsv`, `git log` and the `final_eval.py` output.

## Script (~3:00)

**0:00 Hook (20 s)**
> "Every airline faces the same decision thousands of times a year: pull this engine now, or fly it another cycle? Pull early and you throw away life you paid millions for. Pull late and you get a grounded aircraft and a headline. **Early is wasted engine life. Late is a grounded aircraft.**"

**0:20 What we built (30 s)**
> "Jetfyre is a verifiable autoresearch loop for that decision. An AI agent edits one file, the remaining-life model and the threshold for pulling an engine. A fixed evaluator replays held-out engines cycle by cycle, the way an airline lives it, and charges for every wasted cycle plus 500 cycles for every failure. The change is kept with a git commit only if it lowers the cost **and** wins on 4 of 5 engine folds. Otherwise it's reverted. About one turn a minute, on a laptop CPU."

**0:50 Why the evaluator is honest (30 s)**
> "Three guards. One: folds split by engine, never by row, so the model can't memorise an engine. Two: a causality check cuts every track at a random cycle, and if a prediction changes, the feature peeked at the future and the run fails. Three: the scorer and the test sets are locked. The agent can't edit `evaluate.py`, can't open `locked/`, and a run over 60 seconds is a loss."

**1:20 Evidence (50 s)**
> "We ran {{N_TURNS}} turns in {{MINUTES}} minutes. The baseline, gradient boosting on raw sensors with T=30, cost {{BASELINE_COST}} cycles per engine with {{BASELINE_FAILS}} failures. The best model costs **{{BEST_COST}}** with **{{BEST_FAILS}}** failures, a {{IMPROVEMENT_PCT}}% reduction. What the agent found on its own: {{TOP_WINS}}, e.g. rolling means and slopes, dropping dead sensors, capping the target at about 125, and a loss that charges late errors more."
>
> "Then we opened the locked folder once. On the official FD001 test: RMSE {{FD001_RMSE}}, NASA score {{FD001_SCORE}}, which you can set beside published papers. On FD003, with a second fault mode the loop **never saw**: RMSE {{FD003_RMSE}}, score {{FD003_SCORE}}. Replay on 100 unseen FD003 engines: {{FD003_REPLAY}}. The ranking holds whether a failure costs 250, 500 or 1,000 cycles."

**2:10 Deployment (35 s)**
> "This plugs into what airlines already run. Engine health monitoring data goes in as a CSV per engine-cycle. A per-engine remaining life and a PULL or KEEP flag come out into the MRO planning queue. CPU only, so it runs on-prem. When new removal histories arrive, the loop reruns overnight, and every candidate model is a git commit a human engineer approves. The same harness (fixed evaluator, one editable file, keep-or-revert) works for any asset that degrades: APUs, landing gear, wind turbines, rail bogies."

**2:45 Close (15 s)**
> "If the model holds on a fault mode it never saw, the loop learned wear, not the benchmark. That's what makes autoresearch deployable."

## Live-demo runbook

```bash
source .venv/bin/activate

# 1. Show the contract
cat program.md                       # the agent's one-page rules
git log --oneline | head -20         # kept changes = commits

# 2. Show the research log
column -t -s $'\t' results.tsv | tail -15

# 3. Run one live turn (~1 min): make a small edit to model.py first
python loop.py "longer 30-cycle rolling window on temperature sensors"
tail -1 results.tsv
ls runs/ | tail -3                   # per-turn diff, kept or discarded

# 4. Show a cheat being caught (optional): add a feature using the full-track mean,
#    and the causality guard fails the run

# 5. Final, one-time unlock
python final_eval.py                 # FD001 test, FD003 test, FD003 replay @ 250/500/1000
```

## Results table (fill in)

| | Baseline | Best | Δ |
|---|---|---|---|
| CV replay cost (mean, cycles/engine) | {{BASELINE_COST}} | {{BEST_COST}} | {{IMPROVEMENT_PCT}}% |
| CV failures | {{BASELINE_FAILS}} | {{BEST_FAILS}} | |
| FD001 test RMSE | {{B_FD001_RMSE}} | {{FD001_RMSE}} | |
| FD001 test NASA score | {{B_FD001_SCORE}} | {{FD001_SCORE}} | |
| FD003 test RMSE | {{B_FD003_RMSE}} | {{FD003_RMSE}} | |
| FD003 test NASA score | {{B_FD003_SCORE}} | {{FD003_SCORE}} | |
| FD003 replay @ C_FAIL 250 / 500 / 1000 | {{B_R250}} / {{B_R500}} / {{B_R1000}} | {{R250}} / {{R500}} / {{R1000}} | |

## Likely judge questions

- **"Isn't C-MAPSS simulated?"** Yes. The point is the *harness*: the fixed evaluator, the locked holdout and the operational cost. Real EHM data drops in with the same contract. Censored histories (engines removed before failure) are the main gap.
- **"Why 500?"** It is a guess, deliberately bigger than any engine's life. We show the ranking at 250 and 1,000.
- **"Couldn't the agent overfit the CV over 30 turns?"** That's why FD003 exists: an unseen fault mode, opened once.
- **"Why not just optimise RMSE?"** RMSE treats early and late errors as equal. Airlines don't.
