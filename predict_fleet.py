"""Deployment shim: today's fleet snapshot in, a pull list out.

An airline's engine-health-monitoring feed (one row per engine per flight cycle, the
C-MAPSS layout: unit, cycle, 3 settings, 21 sensors) goes in; a CSV the maintenance
planner can load into their MRO system comes out: one row per engine with predicted
remaining cycles and an action. The model is whatever model.py the loop last kept.

Usage: .venv/bin/python predict_fleet.py FLEET_FILE [--out reports/pull_list.csv] [--watch 20]
"""
import argparse
import sys
import warnings
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from evaluate import load_model, predict_track  # noqa: E402
from prepare import load_folds, load_raw, to_tracks  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("fleet")
    ap.add_argument("--model", default=str(ROOT / "model.py"))
    ap.add_argument("--out", default=str(ROOT / "reports" / "pull_list.csv"))
    ap.add_argument("--watch", type=float, default=20, help="WATCH band: cycles above T")
    args = ap.parse_args()
    warnings.filterwarnings("ignore")

    mod = load_model(args.model)
    T = float(mod.T)
    m = mod.Model()
    m.fit([t for f in load_folds() for t in f])  # all 100 FD001 run-to-failure engines

    rows = []
    for t in to_tracks(load_raw(args.fleet)):
        rul = float(predict_track(m, t)[-1])
        action = "PULL" if rul <= T else "WATCH" if rul <= T + args.watch else "OK"
        rows.append({"engine": int(t.unit.iloc[0]), "cycles_flown": int(t.cycle.iloc[-1]),
                     "predicted_rul": round(rul, 1), "action": action})
    out = pd.DataFrame(rows).sort_values("predicted_rul")
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(args.out, index=False)
    counts = out.action.value_counts().to_dict()
    print(f"T={T:g}  fleet={len(out)}  PULL={counts.get('PULL', 0)}  WATCH={counts.get('WATCH', 0)}  "
          f"OK={counts.get('OK', 0)}  -> {args.out}")
    print(out.head(10).to_string(index=False))
