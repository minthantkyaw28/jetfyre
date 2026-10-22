"""Data loading and fold definitions for the C-MAPSS autoresearch loop."""
import json
from pathlib import Path

import numpy as np
import pandas as pd

COLUMNS = (["unit", "cycle", "setting_1", "setting_2", "setting_3"]
           + [f"s{i}" for i in range(1, 22)])
DATA = Path(__file__).parent / "data"
TRAIN = DATA / "train_FD001.txt"


def load_tracks(path):
    """Return {unit id: track}, each track sorted by cycle with a 0-based index."""
    df = pd.read_csv(path, sep=r"\s+", header=None, names=COLUMNS)
    return {int(u): g.sort_values("cycle").reset_index(drop=True)
            for u, g in df.groupby("unit")}


def get_folds(n_folds=5):
    """Split the training unit ids into 5 folds of 20 with numpy seed 0."""
    units = np.array(sorted(load_tracks(TRAIN)))
    perm = np.random.RandomState(0).permutation(units)
    return [sorted(int(u) for u in fold) for fold in np.array_split(perm, n_folds)]


if __name__ == "__main__":
    folds = get_folds()
    (DATA / "folds.json").write_text(json.dumps(folds))
    print(f"wrote data/folds.json: {[len(f) for f in folds]} engines per fold")
