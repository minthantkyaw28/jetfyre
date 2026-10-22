# Pitch deck: "When to pull an engine" (transcript)

Source: `When to Pull an Engine.pdf` (10 slides). Visual identity: navy `#13161d` with cream `#F3F0E8` slides, amber
accent `#E8A33D`, a grotesk display face (Space Grotesk-like), and IBM Plex Sans/Mono for body and labels.
`[__]` marks a placeholder still to fill (see "Numbers to fill" at the bottom).

1. **Title.** MOONFIRE VENTURES HACK · AUTORESEARCH FOR REAL-WORLD VALUE.
   *When to pull an engine*: "An autoresearch loop that tunes engine removal against the bill an airline actually pays."
   "Early is wasted engine life. Late is a grounded aircraft." [Team name] · [Names]
2. **Every engine pull is a bet on time.**
   - Pull too early → *Wasted life*: "Every cycle left on the wing was paid for. Pull too soon and it goes in the bin, engine after engine, across the fleet."
   - Pull too late → *$50k to $150k*: "One estimate for a single day on the ground after an engine event. Three days or more can pass $600,000."
   - "Boeing puts a grounded aircraft as high as $150,000 an hour. The right day to pull sits between the two mistakes."
   - Sources: Air Cargo Week, "The real cost of AOG"; Boeing estimate cited in Wikipedia, "Aircraft on ground".
3. **The claim.** "Pulling an engine is a threshold on a forecast. Both can be searched, and both can be scored against the airline's own bill." "That is verifiable autoresearch with money on the line."
4. **One turn of the loop.** 01 Hypothesis: read the log and write one line on what should help. 02 Edit: change model.py, the only file the agent can touch. 03 Run: train on four folds of engines, replay the fifth, five times over. 04 Score: mean cost per engine, failures first, waste second. 05 Keep or revert: commit if cost falls and it wins four folds of five. If not, reset. Repeat.
   "Every turn logged to results.tsv · about a minute a turn · about 30 turns an hour on a laptop CPU."
5. **What the agent can and cannot touch.**
   - Open (model.py): features like rolling means and slopes over recent cycles; which of the 21 sensors to keep; a cap on target life near 125 cycles; the model, and a loss that charges late errors more; the pull threshold T.
   - Locked: the split (by engine, never by row); the scorer and the cost of a failure; a 60-second limit on every run; the test engines and the second fault mode, sealed until the end.
6. **The score is the airline's bill.** Replay walks each held-out engine forward one cycle at a time and pulls the first time predicted life ≤ T. Pulled early: cost = cycles of life left. Ran to failure: cost = 500 cycles. Score to minimise: mean cost per engine. "500 is our assumption. An airline sets its own ratio, and we rerun at 250 and 1,000 to show the ranking holds." We also report NASA's asymmetric score and RMSE. Data: NASA C-MAPSS, FD001 and FD003.
7. **Four ways the loop cannot cheat.** Memorising an engine → split by engine. Peeking at the future → random-cycle cut test. A lucky fold → must win 4 of 5 folds. Learning the benchmark → test engines and a second fault mode sealed until one final run.
8. **What the hour produced.** Cost per engine [__] (baseline [__], lower is better). Run to failure [__] (of 100 replayed engines, baseline [__]). Changes kept [__] (out of [__] turns, each one a commit).
   Sealed check, run once (Baseline | Best): FD001 test NASA score; FD001 test RMSE in cycles; FD003 (unseen fault mode) NASA score; ranking holds at 250 and 1,000 cycles [yes or no].
9. **How it plugs into an airline.** Data in: the airline's own engine-health data replaces C-MAPSS (sensor snapshots per engine per flight, with removal records as labels). What comes out: a model, a pull threshold and a log of every change the agent tried, why it tried it and what it scored. How it runs: on a laptop CPU, rerun each week as new removals arrive; a reliability engineer signs off each kept change. "The cost of a failure against a cycle of life is a business input the airline sets, not a number hidden in our code."
10. **Close.** "The loop finds the day between wasted life and a grounded aircraft." "Built on public data in an hour. Ready to point at an airline's own." [Our ask] · [Team name] · [Contact]

## Numbers to fill (from results.tsv and reports/final.md)
| Placeholder | Source |
|---|---|
| Cost per engine (best / baseline) | `best.json` mean_cost / results.tsv turn 0 |
| Run to failure (best / baseline) of 100 | `fails` column (sum over 5 folds × 20 engines) |
| Changes kept / turns | count of `keep` verdicts / rows |
| FD001 test NASA + RMSE, FD003 NASA | `reports/final.md` (final_eval.py, run once) |
| Ranking holds at 250 / 1,000 | `reports/final.md` ranking section |
