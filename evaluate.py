"""FIXED. Scorer, costs and the 5-fold replay. The research agent may not edit this.

Train on 4 folds, replay the 5th, five times over. Replay walks each held-out
engine forward one cycle at a time and pulls it the first time predicted life
falls to T or below. A pull costs the cycles of life thrown away; a failure
costs C_FAIL, more than any FD001 engine's whole life, so the score reads as
failures first, waste second.

Usage: .venv/bin/python evaluate.py [--model model.py] [--out runs/last_eval.json]
"""
import argparse
import importlib.util
import json
import random
import signal
import sys
import time
import warnings
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from prepare import load_folds  # noqa: E402

C_CYCLE, C_FAIL = 1.0, 500.0  # assumption: a failure costs 500 cycles of life (FD001 max life is 362)
C_FAIL_SENSITIVITY = (250.0, 500.0, 1000.0)  # to show the ranking does not hang on one guess
TIME_BUDGET = 60  # seconds for the whole 5-fold run; over budget counts as a loss
RMSE_WINDOW = 125  # diagnostic RMSE is taken over the last 125 cycles of each engine


def nasa_score(pred, true):
    d = np.asarray(pred, float) - np.asarray(true, float)  # d > 0 means the warning came late
    return float(np.sum(np.where(d < 0, np.exp(-d / 13) - 1, np.exp(d / 10) - 1)))


def true_rul(track):
    """True cycles left at each row of a run-to-failure track (0 on the failure cycle)."""
    life = len(track)
    return life - np.arange(1, life + 1)


def replay(pred, rul, T, c_fail=C_FAIL):
    """One engine, new to failure. Returns (cost, failed, wasted_cycles)."""
    hit = np.flatnonzero(pred <= T)
    if hit.size and rul[hit[0]] > 0:
        return C_CYCLE * rul[hit[0]], False, int(rul[hit[0]])  # pulled early: wasted life
    return c_fail, True, 0  # ran to failure


def replay_cost(preds, ruls, T, c_fail=C_FAIL):
    out = [replay(p, r, T, c_fail) for p, r in zip(preds, ruls)]
    pulled = [w for _, f, w in out if not f]
    return {
        "cost": float(np.mean([c for c, _, _ in out])),
        "fails": int(sum(f for _, f, _ in out)),
        "waste": float(np.mean(pulled)) if pulled else 0.0,
    }


def keep(new, best):  # per-fold costs, lower wins
    new, best = np.array(new), np.array(best)
    return bool(new.mean() < best.mean() and (new < best).sum() >= 4)


def load_model(path):
    path = Path(path).resolve()
    spec = importlib.util.spec_from_file_location(f"cand_{path.stem}_{time.time_ns()}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def predict_track(m, track):
    p = np.asarray(m.predict(track.copy()), dtype=float).ravel()
    if p.shape != (len(track),) or not np.all(np.isfinite(p)):
        raise ValueError(f"predict must return {len(track)} finite values, got shape {p.shape}")
    return p


def is_causal(m, track, pred, rng):
    """Cut the track at a random cycle; predictions before the cut must not change."""
    for c in (int(rng.integers(1, len(track))), int(rng.integers(1, min(31, len(track))))):
        p = predict_track(m, track.iloc[:c].reset_index(drop=True))
        if not np.allclose(p, pred[:c], rtol=1e-6, atol=1e-6):
            return False
    return True


def run_cv(model_path="model.py", seed=0):
    t0 = time.time()
    mod = load_model(model_path)
    T = float(mod.T)
    folds = load_folds()
    res = {"status": "ok", "T": T, "fold_costs": [], "fold_fails": [], "fold_waste": [],
           "cost_by_cfail": {str(int(c)): [] for c in C_FAIL_SENSITIVITY}}
    sq, nasa, leak_ok = [], [], True
    for k, test in enumerate(folds):
        train = [t.copy() for j, f in enumerate(folds) if j != k for t in f]
        np.random.seed(seed)
        random.seed(seed)
        m = mod.Model()
        m.fit(train)
        preds = [predict_track(m, t) for t in test]
        ruls = [true_rul(t) for t in test]
        for t, p, r in zip(test, preds, ruls):
            unit = int(t.unit.iloc[0])
            if leak_ok and not is_causal(m, t, p, np.random.default_rng(unit)):
                leak_ok = False
            w = r <= RMSE_WINDOW
            sq.extend((p[w] - r[w]) ** 2)
            cut = int(np.random.default_rng(10_000 + unit).integers(len(t) // 3, len(t)))  # test-set-like truncation
            nasa.append(nasa_score(p[cut], r[cut]))
        rc = replay_cost(preds, ruls, T)
        res["fold_costs"].append(round(rc["cost"], 3))
        res["fold_fails"].append(rc["fails"])
        res["fold_waste"].append(round(rc["waste"], 2))
        for c in C_FAIL_SENSITIVITY:
            res["cost_by_cfail"][str(int(c))].append(round(replay_cost(preds, ruls, T, c)["cost"], 3))
    res.update({
        "mean_cost": round(float(np.mean(res["fold_costs"])), 3),
        "fails": int(sum(res["fold_fails"])),
        "waste": round(float(np.mean(res["fold_waste"])), 2),
        "rmse125": round(float(np.sqrt(np.mean(sq))), 3),
        "nasa100": round(float(np.mean(nasa) * 100), 1),  # per-engine mean x 100, comparable in scale to a 100-engine test set
        "leak_ok": leak_ok,
        "secs": round(time.time() - t0, 2),
    })
    if not leak_ok:
        res["status"] = "leak"
    elif res["secs"] > TIME_BUDGET:
        res["status"] = "timeout"
    return res


def _alarm(signum, frame):
    raise TimeoutError(f"run exceeded {TIME_BUDGET}s")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=str(ROOT / "model.py"))
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    warnings.filterwarnings("ignore")
    signal.signal(signal.SIGALRM, _alarm)
    signal.alarm(TIME_BUDGET + 5)
    t0 = time.time()
    try:
        res = run_cv(args.model)
    except TimeoutError as e:
        res = {"status": "timeout", "error": str(e), "secs": round(time.time() - t0, 2)}
    except Exception as e:  # a broken model is a loss, not a crash of the loop
        res = {"status": "error", "error": f"{type(e).__name__}: {e}", "secs": round(time.time() - t0, 2)}
    signal.alarm(0)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(res, indent=1))
    print(json.dumps(res))
