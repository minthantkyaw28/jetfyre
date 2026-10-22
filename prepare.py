"""FIXED. Loads C-MAPSS FD001 train and cuts it BY ENGINE into 5 folds of 20.

Never split by row: consecutive rows of one engine are near copies, so a row
split lets the model memorise the engine. The research agent may not edit this.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
COLS = ["unit", "cycle", "os1", "os2", "os3"] + [f"s{i}" for i in range(1, 22)]
N_FOLDS, SEED = 5, 0


def load_raw(path):
    df = pd.read_csv(path, sep=r"\s+", header=None, names=COLS)
    df[["unit", "cycle"]] = df[["unit", "cycle"]].astype(int)
    return df.sort_values(["unit", "cycle"]).reset_index(drop=True)


def to_tracks(df):
    """One DataFrame per engine, ordered by cycle, index reset."""
    return [g.reset_index(drop=True) for _, g in df.groupby("unit", sort=True)]


def make_folds(units, n_folds=N_FOLDS, seed=SEED):
    rng = np.random.default_rng(seed)
    units = rng.permutation(np.asarray(units))
    return [sorted(int(u) for u in f) for f in np.array_split(units, n_folds)]


def load_folds():
    """Returns a list of 5 lists of tracks (run-to-failure engines)."""
    df = load_raw(DATA / "train_FD001.txt")
    by_unit = {int(t.unit.iloc[0]): t for t in to_tracks(df)}
    folds = json.loads((DATA / "folds.json").read_text())["folds"]
    return [[by_unit[u] for u in f] for f in folds]


if __name__ == "__main__":
    df = load_raw(DATA / "train_FD001.txt")
    folds = make_folds(df.unit.unique())
    (DATA / "folds.json").write_text(json.dumps({"seed": SEED, "folds": folds}, indent=1))
    life = df.groupby("unit").cycle.max()
    print(f"FD001 train: {df.unit.nunique()} engines, {len(df)} rows, "
          f"life min/mean/max {life.min()}/{life.mean():.0f}/{life.max()}")
    print("folds:", [len(f) for f in folds], "-> data/folds.json")
