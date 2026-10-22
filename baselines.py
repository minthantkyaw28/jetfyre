"""Compare the model baseline with a fixed-interval policy and the oracle."""
import json

import numpy as np

from evaluate import C_CYCLE, C_FAIL
from prepare import TRAIN, get_folds, load_tracks


def interval_costs(lives, N, c_fail=C_FAIL):
    """Pull every engine at cycle N: waste life - N if it survives, else fail."""
    lives = np.asarray(lives)
    return np.where(lives > N, C_CYCLE * (lives - N), c_fail)


def fixed_interval(c_fail=C_FAIL):
    """Per fold, pick the N that is cheapest on the 80 training engines, score the held-out 20."""
    lives = {u: len(t) for u, t in load_tracks(TRAIN).items()}
    candidates = np.arange(1, max(lives.values()) + 1)
    out = {"fold_costs": [], "picks": [], "failures": 0, "wasted_cycles": 0.0}
    for fold in get_folds():
        train = [lives[u] for u in lives if u not in fold]
        N = int(min(candidates, key=lambda n: interval_costs(train, n, c_fail).mean()))
        held = np.array([lives[u] for u in fold])
        out["picks"].append(N)
        out["fold_costs"].append(float(interval_costs(held, N, c_fail).mean()))
        out["failures"] += int((held <= N).sum())
        out["wasted_cycles"] += float((held - N)[held > N].sum())
    out["mean_cost"] = float(np.mean(out["fold_costs"]))
    return out


def main():
    fixed = fixed_interval()
    best = json.load(open("best.json"))
    fmt = lambda xs: " ".join(f"{x:7.2f}" for x in xs)
    print(f"{'policy':16} {'fold costs':>40}   mean")
    print(f"{'fixed interval':16} {fmt(fixed['fold_costs']):>40} {fixed['mean_cost']:7.2f}   (N = {fixed['picks']})")
    print(f"{'model (best)':16} {fmt(best):>40} {np.mean(best):7.2f}")
    print(f"{'oracle':16} {fmt([0] * 5):>40} {0:7.2f}")


if __name__ == "__main__":
    main()
