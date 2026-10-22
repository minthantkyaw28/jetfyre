"""Score model.py by replaying held-out engines and pricing every pull decision.

Usage: python evaluate.py [--model PATH] [--c-fail N]
Prints exactly one JSON line on stdout.
"""
import argparse
import contextlib
import importlib.util
import json
import sys
import time

import numpy as np

from prepare import TRAIN, get_folds, load_tracks

C_CYCLE = 1.0
C_FAIL = 500.0
TIME_LIMIT = 60.0


def replay_cost(pred, T, c_fail=C_FAIL, c_cycle=C_CYCLE):
    """Return (cost, failed, wasted cycles) for one track's predictions."""
    n = len(pred)
    for i, p in enumerate(pred):
        life_left = n - (i + 1)
        if p <= T and life_left > 0:
            return c_cycle * life_left, False, float(life_left)
    return c_fail, True, 0.0


def nasa_score(pred, true):
    d = np.asarray(pred, float) - np.asarray(true, float)
    return float(np.sum(np.where(d < 0, np.exp(-d / 13) - 1, np.exp(d / 10) - 1)))


def keep(new_fold_costs, best_fold_costs):
    """Keep only if the mean is lower and at least 4 of 5 folds improve."""
    new, best = np.asarray(new_fold_costs), np.asarray(best_fold_costs)
    return bool(new.mean() < best.mean() and (new < best).sum() >= 4)


def load_model(path, tag="candidate"):
    """Import a model file fresh, under a unique module name."""
    spec = importlib.util.spec_from_file_location(f"vmodel_{tag}_{time.time_ns()}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check_pred(pred, n):
    pred = np.asarray(pred, dtype=float)
    if pred.shape != (n,):
        raise ValueError(f"wrong shape: expected ({n},), got {pred.shape}")
    if not np.all(np.isfinite(pred)):
        raise ValueError("non-finite prediction")
    return pred


def evaluate(model_path="model.py", c_fail=C_FAIL):
    start = time.time()
    tracks = load_tracks(TRAIN)
    out = {"ok": False, "error": None, "fold_costs": [], "mean_cost": None,
           "failures": 0, "wasted_cycles": 0.0, "seconds": 0.0}
    try:
        # Model output goes to stderr so stdout stays one JSON line.
        with contextlib.redirect_stdout(sys.stderr):
            for k, fold in enumerate(get_folds()):
                model = load_model(model_path, tag=str(k))
                T = float(model.T)
                model.fit([tracks[u] for u in tracks if u not in fold])
                costs = []
                for u in fold:
                    track = tracks[u]
                    pred = check_pred(model.predict(track.copy()), len(track))
                    c = int(np.random.default_rng(u).integers(10, len(track)))
                    part = check_pred(model.predict(track.iloc[:c].copy()), c)
                    if np.max(np.abs(part - pred[:c])) > 1e-6:
                        raise ValueError(f"future leak on unit {u} at cut {c}")
                    cost, failed, wasted = replay_cost(pred, T, c_fail)
                    costs.append(cost)
                    out["failures"] += int(failed)
                    out["wasted_cycles"] += wasted
                    if time.time() - start > TIME_LIMIT:
                        raise TimeoutError(f"over {TIME_LIMIT:.0f} seconds")
                out["fold_costs"].append(float(np.mean(costs)))
        out["mean_cost"] = float(np.mean(out["fold_costs"]))
        out["ok"] = True
    except Exception as e:
        out["error"] = f"{type(e).__name__}: {e}"
    out["seconds"] = round(time.time() - start, 2)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="model.py")
    ap.add_argument("--c-fail", type=float, default=C_FAIL)
    args = ap.parse_args()
    print(json.dumps(evaluate(args.model, args.c_fail)))
