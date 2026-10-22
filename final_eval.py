"""FIXED. The once-only unlock: score models on engines the loop never saw.

Run this ONCE, when the research hour ends, on the human's say-so.
  1. Fit each model on all 100 FD001 train engines.
  2. Official FD001 test: RMSE + NASA score on the last observed cycle (comparable to papers).
  3. FD003 test: same, with a second fault mode (fan degradation) the loop never saw.
  4. Replay the 100 unseen FD003 train engines (run to failure) at C_FAIL 250 / 500 / 1000,
     plus the FD001 CV replay at the same costs, to show the ranking does not hang on one guess.

Usage: .venv/bin/python final_eval.py [--models models/baseline.py model.py] [--keeps] [--again]
  --keeps   also score the model.py of every kept commit (does CV progress carry to FD003?)
"""
import argparse
import json
import os
import subprocess
import sys
import time
import warnings
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from evaluate import (C_FAIL_SENSITIVITY, load_model, nasa_score, predict_track,  # noqa: E402
                      replay_cost, run_cv, true_rul)
from prepare import load_folds, load_raw, to_tracks  # noqa: E402

LOCKED = Path(os.environ.get("JETFYRE_LOCKED", ROOT / "locked"))  # override only for smoke tests
REPORTS = Path(os.environ.get("JETFYRE_REPORTS", ROOT / "reports"))


def rmse(a, b):
    return float(np.sqrt(np.mean((np.asarray(a) - np.asarray(b)) ** 2)))


def score_test(m, name):
    tracks = to_tracks(load_raw(LOCKED / f"test_{name}.txt"))
    rul = np.loadtxt(LOCKED / f"RUL_{name}.txt")
    last = np.array([predict_track(m, t)[-1] for t in tracks])
    return {"rmse": round(rmse(last, rul), 2), "nasa": round(nasa_score(last, rul), 1),
            "late": int((last > rul).sum()), "n": len(tracks)}


def score_model(path, unseen):
    mod = load_model(path)
    T = float(mod.T)
    m = mod.Model()
    m.fit([t for f in load_folds() for t in f])
    preds = [predict_track(m, t) for t in unseen]
    ruls = [true_rul(t) for t in unseen]
    cv = run_cv(path)
    out = {"model": str(path), "T": T,
           "fd001_test": score_test(m, "FD001"), "fd003_test": score_test(m, "FD003"),
           "cv_cost": {}, "fd003_replay": {}}
    for c in C_FAIL_SENSITIVITY:
        k = str(int(c))
        out["cv_cost"][k] = round(float(np.mean(cv["cost_by_cfail"][k])), 2)
        r = replay_cost(preds, ruls, T, c)
        out["fd003_replay"][k] = {"cost": round(r["cost"], 2), "fails": r["fails"], "waste": round(r["waste"], 1)}
    return out


def keep_snapshots():
    log = subprocess.run(["git", "log", "--reverse", "--format=%h %s"], cwd=ROOT,
                         capture_output=True, text=True).stdout.splitlines()
    snaps = []
    (REPORTS / "keeps").mkdir(parents=True, exist_ok=True)
    for line in log:
        h, subj = line.split(" ", 1)
        if subj.startswith(("keep ", "baseline ")):
            p = REPORTS / "keeps" / f"{subj.split(':')[0].replace(' ', '_')}_{h}.py"
            p.write_text(subprocess.run(["git", "show", f"{h}:model.py"], cwd=ROOT,
                                        capture_output=True, text=True).stdout)
            snaps.append(p)
    return snaps


def table(rows):
    cf = [str(int(c)) for c in C_FAIL_SENSITIVITY]
    head = ("| model | T | FD001 test RMSE | FD001 test NASA | FD003 test RMSE | FD003 test NASA | "
            + " | ".join(f"CV cost @{c}" for c in cf) + " | "
            + " | ".join(f"FD003 replay cost @{c}" for c in cf) + " | FD003 fails | FD003 waste |")
    lines = [head, "|" + "---|" * (head.count("|") - 1)]
    for r in rows:
        rp = r["fd003_replay"]
        lines.append(f"| {Path(r['model']).name} | {r['T']:g} | {r['fd001_test']['rmse']} | {r['fd001_test']['nasa']} | "
                     f"{r['fd003_test']['rmse']} | {r['fd003_test']['nasa']} | "
                     + " | ".join(str(r["cv_cost"][c]) for c in cf) + " | "
                     + " | ".join(str(rp[c]["cost"]) for c in cf)
                     + f" | {rp['500']['fails']}/100 | {rp['500']['waste']} |")
    return "\n".join(lines)


def ranking(rows):
    out = []
    for c in (str(int(c)) for c in C_FAIL_SENSITIVITY):
        order = sorted(rows, key=lambda r: r["fd003_replay"][c]["cost"])
        out.append(f"- C_FAIL={c}: " + " < ".join(Path(r["model"]).name for r in order))
    return "\n".join(out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="+", default=["models/baseline.py", "model.py"])
    ap.add_argument("--keeps", action="store_true")
    ap.add_argument("--again", action="store_true")
    args = ap.parse_args()
    warnings.filterwarnings("ignore")
    REPORTS.mkdir(exist_ok=True)
    stamp = REPORTS / "unlock_log.txt"
    if stamp.exists() and not args.again:
        sys.exit(f"locked/ was already opened (see {stamp}). Pass --again to reopen; it will be logged.")
    with stamp.open("a") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} opened locked/ for {args.models} keeps={args.keeps}\n")

    unseen = to_tracks(load_raw(LOCKED / "train_FD003.txt"))
    rows = [score_model(ROOT / p, unseen) for p in args.models]
    keep_rows = [score_model(p, unseen) for p in keep_snapshots()] if args.keeps else []

    md = ["# Final evaluation (locked holdout, opened once)", "",
          f"Run at {time.strftime('%Y-%m-%d %H:%M')}. Models fit on all 100 FD001 train engines.",
          "FD001/FD003 test: prediction at the last observed cycle vs official RUL (RMSE, NASA asymmetric score; lower is better).",
          "Replay: 100 unseen FD003 run-to-failure engines, pulled the first cycle predicted RUL <= T; "
          "cost = wasted cycles, or C_FAIL on failure.", "", table(rows), "",
          "## Ranking under different failure costs (FD003 replay)", ranking(rows)]
    if keep_rows:
        md += ["", "## Every kept model: does CV progress carry to unseen engines?", table(keep_rows)]
    (REPORTS / "final.md").write_text("\n".join(md) + "\n")
    (REPORTS / "final.json").write_text(json.dumps({"models": rows, "keeps": keep_rows}, indent=1))
    print("\n".join(md))
