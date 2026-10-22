"""One-shot sealed evaluation. Refuses to run twice unless --force.

Usage: python final.py --baseline PATH --best PATH [--force]
Each model trains on all 100 FD001 training engines, then is scored on:
  - test_FD001 and test_FD003: RMSE and NASA score at each engine's last row, against the RUL files
  - sealed train_FD003: every engine replayed new to failure with the model's own T, giving
    failures, mean wasted cycles per engine and mean cost at failure costs 250, 500 and 1000
  - the cross-validated FD001 replay cost at the same three failure costs
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from evaluate import check_pred, evaluate, load_model, nasa_score, replay_cost
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


def fd003_replay(model, T):
    """Replay every run-to-failure engine in train_FD003 with the model's T, at each failure cost."""
    tracks = load_tracks(SEALED / "train_FD003.txt")
    preds = [check_pred(model.predict(t.copy()), len(t)) for t in tracks.values()]
    out = {}
    for cf in C_FAILS:
        res = [replay_cost(p, T, cf) for p in preds]
        out[str(cf)] = {"engines": len(res), "failures": int(sum(r[1] for r in res)),
                        "mean_wasted": float(np.mean([r[2] for r in res])),
                        "mean_cost": float(np.mean([r[0] for r in res]))}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--best", required=True)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    if DONE.exists() and not args.force:
        sys.exit("final.py has already run (sealed/.final_done exists). Use --force to rerun.")

    train = list(load_tracks(TRAIN).values())
    rows, replays = {}, {}
    for name, path in [("baseline", args.baseline), ("best", args.best)]:
        model = load_model(path, tag=f"final_{name}")
        model.fit(train)
        r = {"T": float(model.T)}
        for fd in ["FD001", "FD003"]:
            r[f"{fd} RMSE"], r[f"{fd} NASA"] = test_metrics(model, fd)
        replays[name] = fd003_replay(model, float(model.T))
        for cf in C_FAILS:
            res = evaluate(path, cf)
            r[f"CV cost @{cf}"] = res["mean_cost"] if res["ok"] else float("nan")
        rows[name] = r

    table = pd.DataFrame(rows).T
    print("| model | " + " | ".join(table.columns) + " |")
    print("|---" * (len(table.columns) + 1) + "|")
    for name, r in table.iterrows():
        print(f"| {name} | " + " | ".join(f"{v:.2f}" for v in r) + " |")
    print("\nFD003 replay, trained on FD001 only, every train_FD003 engine run new to failure:\n")
    print("| model | T | failure cost | failures | mean wasted cycles | mean cost |")
    print("|---|---|---|---|---|---|")
    for name, by_cf in replays.items():
        for cf, x in by_cf.items():
            print(f"| {name} | {rows[name]['T']:g} | {cf} | {x['failures']} of {x['engines']} | "
                  f"{x['mean_wasted']:.2f} | {x['mean_cost']:.2f} |")

    out = Path(__file__).parent / "out"
    out.mkdir(exist_ok=True)
    for name in rows:
        rows[name]["fd003_replay"] = replays[name]
    (out / "final.json").write_text(json.dumps(rows, indent=1))  # read by make_figures.py
    DONE.write_text("done\n")


if __name__ == "__main__":
    main()
