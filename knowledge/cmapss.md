# C-MAPSS dataset facts

Source: NASA PCoE, "Turbofan Engine Degradation Simulation Data Set". Saxena, Goebel, Simon and Eklund, *Damage Propagation Modeling for Aircraft Engine Run-to-Failure Simulation*, PHM08. The PDF and readme are in `knowledge/reference/`.

## Subsets (from the readme)

| Subset | Train engines | Test engines | Operating conditions | Fault modes |
|---|---|---|---|---|
| **FD001** | 100 | 100 | ONE (sea level) | ONE (HPC degradation) |
| FD002 | 260 | 259 | SIX | ONE (HPC degradation) |
| **FD003** | 100 | 100 | ONE (sea level) | TWO (HPC + fan degradation) |
| FD004 | 248 | 249 | SIX | TWO (HPC + fan degradation) |

- We use **FD001** for the loop and **FD003** for the hard holdout. FD003 has the same single operating condition but adds a **fan-degradation fault mode** the loop never sees.
- **Train** trajectories run from healthy to **failure**. **Test** trajectories stop some time *before* failure. `RUL_FDxxx.txt` gives the true remaining life at the last test cycle.
- Each engine starts with unknown initial wear and manufacturing variation, which counts as normal. The data contains sensor noise.

## Columns (26, space-separated, no header)

| # | Name | Meaning |
|---|---|---|
| 1 | `unit` | engine id |
| 2 | `cycle` | time in operating cycles |
| 3–5 | `os1`, `os2`, `os3` | operational settings |
| 6–26 | `s1`…`s21` | sensors (below) |

| Sensor | Common name | Description |
|---|---|---|
| s1 | T2 | fan inlet temperature (°R) |
| s2 | T24 | LPC outlet temperature (°R) |
| s3 | T30 | HPC outlet temperature (°R) |
| s4 | T50 | LPT outlet temperature (°R) |
| s5 | P2 | fan inlet pressure (psia) |
| s6 | P15 | bypass-duct pressure (psia) |
| s7 | P30 | HPC outlet pressure (psia) |
| s8 | Nf | physical fan speed (rpm) |
| s9 | Nc | physical core speed (rpm) |
| s10 | epr | engine pressure ratio (P50/P2) |
| s11 | Ps30 | HPC outlet static pressure (psia) |
| s12 | phi | fuel flow / Ps30 (pps/psi) |
| s13 | NRf | corrected fan speed (rpm) |
| s14 | NRc | corrected core speed (rpm) |
| s15 | BPR | bypass ratio |
| s16 | farB | burner fuel-air ratio |
| s17 | htBleed | bleed enthalpy |
| s18 | Nf_dmd | demanded fan speed (rpm) |
| s19 | PCNfR_dmd | demanded corrected fan speed (rpm) |
| s20 | W31 | HPT coolant bleed (lbm/s) |
| s21 | W32 | LPT coolant bleed (lbm/s) |

## FD001 train: computed from `data/train_FD001.txt`

- **20,631 rows, 100 engines.**
- **Engine life (cycles to failure): min 128, mean 206.3, median 199, max 362.** A failure cost of 500 is therefore larger than any engine's whole life.
- **Near-constant columns (drop them):** `os3`, `s1`, `s5`, `s6` (2 unique values), `s10`, `s16`, `s18`, `s19`.
- `os1` and `os2` are pure noise in FD001 (correlation with RUL ≈ 0).
- **The 14 informative sensors:** s2, s3, s4, s7, s8, s9, s11, s12, s13, s14, s15, s17, s20, s21.
  - These rise as the engine wears (correlation with RUL is negative): s2, s3, s4, s8, s9, s11, s13, s14, s15, s17.
  - These fall as the engine wears (correlation is positive): s7, s12, s20, s21.
  - The strongest linear correlations with RUL (|r| ≈ 0.64–0.70) are s11, s4, s12, s7, s15, s21 and s20. Raw single-cycle values are noisy, so rolling means help.

## Standard practice in the literature

- **Piecewise-linear RUL target:** cap the training RUL at **125–130**. A healthy engine shows no degradation signal, so its "true" RUL above the cap cannot be learned.
- **Per-sensor normalisation:** min-max or z-score, fitted on the training set only.
- **NASA (PHM08) asymmetric score:** with `d = predicted − true`,
  - `s = Σ exp(−d/13) − 1` if d < 0 (early, mild penalty)
  - `s = Σ exp(d/10) − 1` if d ≥ 0 (late, harsh penalty)
  - Lower is better. A late error costs more than an early error of the same size.
- Test evaluation scores the prediction at the **last observed cycle** of each test engine against `RUL_FD001.txt`.

## Published FD001 test benchmarks (APPROXIMATE, from memory, verify before quoting)

| Model | RMSE | NASA score |
|---|---|---|
| Classic CNN (Sateesh Babu et al., 2016) | ~18.4 | ~1290 |
| LSTM (Zheng et al., 2017) | ~16 | ~340 |
| Strong recent deep models (CNN/LSTM/attention/transformer) | ~11–12 | ~200–250 |

These use the RUL cap of about 125 and score only the last test cycle. Our replay cost is a *different* (operational) metric. We report RMSE and the NASA score alongside it so judges can compare.
