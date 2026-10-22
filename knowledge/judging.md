# Judging map: each criterion and how Jetfyre answers it

The brief's text is in `knowledge/hack-brief.md`. The five criteria are weighted 20% each.

## 1. Commercial value and relevance of the use case (20%)

- **Problem:** airlines must decide *when to pull an engine*.
  - Pull too early and they throw away paid-for life on an asset worth tens of millions.
  - Pull too late and the engine is removed unscheduled or the aircraft is AOG (aircraft on ground).
- **Who benefits:** airline engineering and MRO teams, engine lessors, and OEM fleet-support and engine health monitoring (EHM) programmes.
- **Value levers** (APPROXIMATE, to be verified before quoting):
  - An unscheduled engine removal costs roughly **$1M+ per event** once you count the spare-engine lease, logistics, disrupted schedule and passenger compensation.
  - AOG costs run roughly **$10k–$150k per day**, depending on aircraft type.
  - A narrowbody engine shop visit costs roughly **$3M–$7M**, and a widebody one **$10M+**.
  - Each cycle of life wasted by an early pull is a pro-rata slice of that shop-visit cost.
- **Our metric is money-shaped:** cost = wasted cycles + 500 cycles per failure. It reads as *failures first, waste second*, which is the airline's priority order.

## 2. Technical design, implementation and originality (20%)

- Karpathy-style **verifiable autoresearch**: hypothesis → edit `model.py` → `python loop.py "…"` → score → git commit or revert.
- **Strict split between what the agent may and may not touch.** `prepare.py`, `evaluate.py`, `loop.py` and `final_eval.py` are fixed and hash-checked. Only `model.py` is editable. `locked/` is never opened.
- **Original angle:** the agent optimises an **operational replay cost**, not RMSE.
  - Replay walks each engine forward cycle by cycle and pulls at the first `pred ≤ T`, exactly as an airline would live it.
  - The agent searches the model *and* the decision threshold `T` together.
- **Orchestration:** `scripts/autoresearch.sh` runs headless `claude -p` turns. Each turn gets a fresh context and reads `program.md`, `results.tsv` and `memory/insights.md`.
- **Full audit trail:** git history plus a per-turn diff in `runs/`.

## 3. Evaluation and evidence (20%)

- A baseline (gradient boosting on raw sensors, `T=30`) against the best kept model, on 5-fold engine-level CV.
- `results.tsv` shows every hypothesis, its 5 fold costs and its verdict (including the reverts, so the evidence shows honest negative results).
- A final one-time unlock reports:
  - **FD001 test:** RMSE and NASA score, comparable to papers (see `knowledge/cmapss.md`)
  - **FD003 test:** RMSE and NASA score on an **unseen second fault mode**
  - **FD003 train replay** (100 unseen run-to-failure engines) at C_FAIL = 250 / 500 / 1000, baseline vs best

## 4. Deployment feasibility, generalisability and interoperability (20%)

- **Input:** the per-cycle sensor snapshot table that EHM systems already produce (ACARS/QAR-derived trend data, as CSV).
- **Output:** per-engine predicted RUL plus a **PULL / KEEP** flag. It drops into an MRO planning tool (AMOS/TRAX-style work-order queue) or a spreadsheet.
- **CPU only**, about a minute per turn, no GPU and no cloud dependency. It can run on-prem where airline data must stay.
- **Retraining:** the loop reruns whenever the fleet's run-to-failure history grows. A **human approves each model promotion** (the git commit is the change-control record).
- **Generalisation evidence:** FD003 holdout (new fault mode), fold-by-engine CV, the 4-of-5 rule and the causality guard.

## 5. Ease of use and communication (20%)

- One command per turn: `python loop.py "hypothesis"`. One page of rules in `program.md`. One results table in `results.tsv`. One final command, `python final_eval.py`.
- The README has the loop diagram and quickstart. `knowledge/pitch.md` has the 3-minute script and the demo runbook.

---

## The brief's "what we want teams to show"

| Bullet | Our answer |
|---|---|
| **Valuable use case** | Engine-removal timing. Airlines, lessors and MROs benefit. Fewer failures plus fewer wasted cycles means less AOG and lower shop-visit cost per flight hour. |
| **Research loop & stack** | The agent proposes changes to features, model family, loss, target cap and threshold `T`. It runs on a laptop CPU through Claude Code (interactive, or headless via `scripts/autoresearch.sh`). Feedback comes from fold costs plus the keep/revert verdict, which go into `results.tsv` and `memory/insights.md` and are read on the next turn. |
| **Meaningful evaluator** | See below. |
| **Practical adoption** | A CSV in / flag out contract, CPU only, human-in-the-loop promotion, git as change control. |
| **Evidence** | The baseline vs best table, the full turn log, the FD001/FD003 test scores and the C_FAIL sensitivity. |

## The brief's explicit questions

### Why does the evaluator measure the right thing?

- The decision an airline makes is binary and sequential: *pull now, or fly another cycle?* Replay simulates exactly that, cycle by cycle, using only data available at each moment.
- The cost has the airline's units:
  - an early pull wastes the cycles left on the engine
  - a failure costs 500 cycles, more than any FD001 engine's whole life (max 362)
  - so **no amount of saved waste can buy back a failure**
- RMSE treats early and late errors the same. Our cost, like NASA's score, punishes late errors far more. Replay goes further and scores the *decision*, not just the estimate.

### Where might it fail?

- **Simulated data:** C-MAPSS is a physics simulation with an idealised noise model. Real fleets have sensor drift, maintenance resets (washes, module swaps), missing data and censored histories, since most engines are removed *before* failure.
- **C_FAIL = 500 is a guess.** We rerun the final replay at 250 and 1,000 to show the ranking does not depend on it.
- **One operating condition:** FD001 and FD003 are sea-level only. FD002 and FD004 (six conditions) would need per-condition normalisation.
- **Pull at the cycle boundary:** replay assumes the engine can be pulled the instant the flag fires, with no lead time for spares or hangar slots. In practice `T` must include planning lead time.
- **Small n:** 100 engines across 5 folds of 20 means fold costs are noisy. The 4-of-5 rule guards against this, but it can still reject small real gains.

### Risks of overfitting and leakage, and how we close them

| Risk | Guard |
|---|---|
| Memorising engines (rows from one engine are near copies) | Folds split **by engine**, never by row |
| Features that peek at the future (centred windows, whole-track normalisation, using track length) | **Causality guard:** cut each track at a random cycle and require identical predictions before the cut |
| One lucky fold carrying a change | **Keep only if** the mean is lower **and** it wins on ≥ 4 of 5 folds |
| Overfitting the CV through ~30 turns of selection | A one-time unlock of `locked/`: FD001 test plus **FD003, with a fault mode never seen** |
| Agent editing the scorer or reading the test set | Fixed files are hash-checked by `loop.py`. Only `model.py` may change. `locked/` is denied in Claude Code settings and in `program.md` |
| Slow brute force | A run over 60 s counts as a loss |

### Will improvements generalise beyond the benchmark?

- The test is FD003. **If the model holds on a second fault mode the loop never saw, the loop learned wear, not the benchmark.**
- The kept changes are physically motivated: smoothing noisy sensors, wear-rate slopes, dropping dead sensors, a capped target and an asymmetric loss. None of them encodes anything FD001-specific.

### How would it be used in practice?

1. EHM trend data per engine-cycle lands nightly.
2. The model scores every engine and outputs RUL plus a PULL/KEEP flag into the MRO planning queue.
3. A powerplant engineer reviews the flagged engines and schedules shop visits.
4. As new run-to-failure (or removal) histories accumulate, the autoresearch loop reruns overnight. Any candidate model is a git commit that a human approves before promotion.
