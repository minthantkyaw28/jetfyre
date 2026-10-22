"""One-shot sealed evaluation. Refuses to run twice unless --force.

Usage: python final.py --baseline PATH --best PATH [--force]
"""
import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from evaluate import evaluate, load_model, nasa_score
from prepare import TRAIN, load_tracks

SEALED = Path(__file__).parent / "sealed"
DONE = SEALED / ".final_done"
C_FAILS = [250, 500, 1000]


def test_metrics(model, fd):
    """Predict at each test engine's last row and score against the RUL file."""
    tracks = load_tracks(SEALED / f"test_{fd}.txt")
    true = pd.read_csv(SEALED / f"RUL_{fd}.txt", header=None)[0].to_numpy(float)
    pred = np.array([model.predict(tracks[u])[-1] for u in sorted(tracks)])
    return float(np.sqrt(np.mean((pred - true) ** 2))), nasa_score(pred, true)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--best", required=True)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    if DONE.exists() and not args.force:
        sys.exit("final.py has already run (sealed/.final_done exists). Use --force to rerun.")

    train = list(load_tracks(TRAIN).values())
    rows = {}
    for name, path in [("baseline", args.baseline), ("best", args.best)]:
        model = load_model(path, tag=f"final_{name}")
        model.fit(train)
        r = {}
        for fd in ["FD001", "FD003"]:
            r[f"{fd} RMSE"], r[f"{fd} NASA"] = test_metrics(model, fd)
        for cf in C_FAILS:
            res = evaluate(path, cf)
            r[f"CV cost @{cf}"] = res["mean_cost"] if res["ok"] else float("nan")
        rows[name] = r

    table = pd.DataFrame(rows).T
    print("| model | " + " | ".join(table.columns) + " |")
    print("|---" * (len(table.columns) + 1) + "|")
    for name, r in table.iterrows():
        print(f"| {name} | " + " | ".join(f"{v:.2f}" for v in r) + " |")
    DONE.write_text("done\n")


if __name__ == "__main__":
    main()
