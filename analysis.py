"""Out-of-fold predictions for the baseline and best models, for the site's replay console.

Usage: python analysis.py [--baseline PATH] [--best PATH]
Writes out/preds_baseline.csv and out/preds_best.csv with columns unit,fold,cycle,life_left,pred:
one row per held-out engine per cycle, from the same folds and fits as evaluate.py.
The baseline defaults to model.py at the commit named "baseline", saved as out/model_baseline.py.
"""
import argparse
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd

from evaluate import check_pred, load_model
from prepare import TRAIN, get_folds, load_tracks

ROOT = Path(__file__).parent
OUT = ROOT / "out"


def baseline_model_path():
    sha = subprocess.run(["git", "log", "--format=%h", "--grep=^baseline$", "-n", "1"],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    src = subprocess.run(["git", "show", f"{sha}:model.py"], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout
    path = OUT / "model_baseline.py"
    path.write_text(src)
    return path


def oof_predictions(model_path):
    tracks = load_tracks(TRAIN)
    rows = []
    for k, fold in enumerate(get_folds()):
        model = load_model(model_path, tag=f"analysis_{k}")
        model.fit([tracks[u] for u in tracks if u not in fold])
        for u in fold:
            t = tracks[u]
            pred = check_pred(model.predict(t.copy()), len(t))
            rows.append(pd.DataFrame({"unit": u, "fold": k + 1, "cycle": t["cycle"].to_numpy(),
                                      "life_left": len(t) - 1 - np.arange(len(t)), "pred": pred.round(4)}))
    return pd.concat(rows, ignore_index=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", default=None)
    ap.add_argument("--best", default=str(ROOT / "model.py"))
    args = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    for name, path in [("baseline", args.baseline or baseline_model_path()), ("best", args.best)]:
        df = oof_predictions(path)
        df.to_csv(OUT / f"preds_{name}.csv", index=False)
        print(f"wrote out/preds_{name}.csv: {df['unit'].nunique()} engines, {len(df)} rows")


if __name__ == "__main__":
    main()
