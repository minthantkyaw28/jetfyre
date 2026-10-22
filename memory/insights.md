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
