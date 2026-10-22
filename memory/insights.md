# Research insights

One line per turn, appended by the research agent after `loop.py` prints its verdict.
Read the whole file before choosing a hypothesis — don't repeat what's already here.

Format:
```
- T<turn> | <hypothesis> → <keep|revert|loss:reason> (mean <new> vs <best>, wins <k>/5, fails <n>) | <lesson in one clause>
```

## Log

- T0002 | lower pull threshold T 30→20 → keep (mean 22.95 vs 32.84, wins 5/5, fails 0) | with 0 fails the threshold sets the waste (still ≈T+3); the late-life model is tight enough for T=20, so keep lowering T, and add asymmetric loss or smoothing first if fails show up
- T0003 | lower pull threshold T 20→12 → keep (mean 14.95 vs 22.95, wins 5/5, fails 0) | waste still ≈T+3 (folds 1-3 ≈T+4-5, folds 4-5 ≈T+1), so the overshoot is constant; pulls at RUL 0 count as failures, so T has little room left (≈8 cycles), and the next gains likely come from a tighter late-life model (RUL cap, rolling features) that cuts the +3 overshoot, not from lowering T blindly
- T0004 | causal rolling mean w=10 on the 14 informative sensors (added to raw features) → keep (mean 11.08 vs 14.95, wins 5/5, fails 0) | smoothing removed the +3 overshoot: waste is now ≈T−1 (folds 4-5 ≈9), so late-life preds now run slightly high and there is less slack before fails; check per-fold margin before lowering T again, and try longer windows/EWMA/slopes next
- T0005 | add causal rolling mean w=30 on the 14 informative sensors (alongside w=10) → discard (mean 11.00 vs 11.08, wins 3/5, fails 0) | rmse125 fell 32.9→27.2 but cost barely moved (f1/f3/f5 better, f2/f4 worse): more input smoothing improves global fit but not the late-life crossing, so stop stacking rolling windows; the remaining lever is lowering T with less noise/bias near RUL≈T (try RUL cap 125 or an asymmetric/quantile loss together with the T it allows)
- T0006 | cap training RUL target at 125 → discard (mean 11.20 vs 11.08, wins 2/5, fails 0) | rmse125 fell 32.9→21.0 (better global fit), but cost was flat or slightly worse (f2 better, f4/f5 worse +0.2/+0.8). Like T0005, a better global fit doesn't move the late-life crossing; the waste comes from bias and noise right around RUL≈12, so next aim the loss/weights at that region (quantile/asymmetric loss, or sample weights ∝ 1/(RUL+k)) instead of the target or the inputs
- T0007 | causal EWMA span=5 over the predicted-RUL series (post-processing) → discard (mean 13.76 vs 11.08, wins 4/5, fails 1) | lag works as intended: waste fell 11.08→8.83 and f1-f4 all improved by ~2-3 (10.4/9.0/10.75/7.15), but one fold-5 engine ran to failure (f5 31.5), so ~2 cycles of lag is roughly the whole safety margin on f5. Pulling later only pays once the late-life error is lower, so before any lag or lower T, add a conservative bias (quantile alpha<0.5 or asymmetric loss) to protect the worst engine; a shorter span (3) is at most a marginal retry
- T0008 | per-engine causal baseline delta (r10 minus own first-≤20-cycle mean, 14 informative sensors) → discard (mean 11.54 vs 11.08, wins 1/5, fails 0) | rmse125 fell 32.9→21.6, but cost got worse: only f1 improved (13.0→11.65), while f4/f5 waste rose ~1.4 (10.75/10.1) because crossings moved earlier. This is the third input/target change (after T0005 and T0006) that improves the global fit but not the cost, so the RUL≈T crossing is set by the loss and post-processing, not by feature quality. The extra f4/f5 margin it buys could only pay off when paired with a lower T or lag, so the next untried single lever is sample weights ∝ 1/(RUL+k) or quantile alpha<0.5 paired with a T retune
