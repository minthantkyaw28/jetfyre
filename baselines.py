"""Compare the model baseline with a fixed-interval policy and the oracle."""
import json

import numpy as np

from evaluate import C_CYCLE, C_FAIL
from prepare import TRAIN, get_folds, load_tracks


def interval_costs(lives, N):
    """Pull every engine at cycle N: waste life - N if it survives, else fail."""
    lives = np.asarray(lives)
    return np.where(lives > N, C_CYCLE * (lives - N), C_FAIL)


def main():
    lives = {u: len(t) for u, t in load_tracks(TRAIN).items()}
    folds = get_folds()
    candidates = np.arange(1, max(lives.values()) + 1)
    fold_costs, picks = [], []
    for fold in folds:
        train = [lives[u] for u in lives if u not in fold]
        N = int(min(candidates, key=lambda n: interval_costs(train, n).mean()))
        picks.append(N)
        fold_costs.append(float(interval_costs([lives[u] for u in fold], N).mean()))
    best = json.load(open("best.json"))
    fmt = lambda xs: " ".join(f"{x:7.2f}" for x in xs)
    print(f"{'policy':16} {'fold costs':>40}   mean")
    print(f"{'fixed interval':16} {fmt(fold_costs):>40} {np.mean(fold_costs):7.2f}   (N = {picks})")
    print(f"{'model (best)':16} {fmt(best):>40} {np.mean(best):7.2f}")
    print(f"{'oracle':16} {fmt([0] * 5):>40} {0:7.2f}")


if __name__ == "__main__":
    main()
