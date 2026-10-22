"""Engine removal model. The agent edits this file and nothing else.

Interface: T, fit(tracks), predict(track). predict(track)[i] may use rows 0..i only.
"""
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor

# ---- T: pull the engine at the first row where predicted life <= T ----
T = 15

# ---- Features: computed row by row, nothing looks ahead ----
SETTINGS = ["setting_1", "setting_2", "setting_3"]
SENSORS = [f"s{i}" for i in range(1, 22)]
FEATURES = SETTINGS + SENSORS + ["cycle"]


WINDOW = 10


def features(track):
    raw = track[FEATURES].to_numpy(dtype=float)
    # Backward-looking rolling mean: row i uses rows max(0, i-WINDOW+1)..i.
    roll = track[SENSORS].rolling(WINDOW, min_periods=1).mean().to_numpy(dtype=float)
    return np.hstack([raw, roll])


# ---- Target: true life left, capped ----
LIFE_CAP = 125


def target(track):
    life_left = len(track) - 1 - np.arange(len(track))
    return np.minimum(life_left, LIFE_CAP).astype(float)


# ---- Model ----
_model = HistGradientBoostingRegressor(random_state=0)


def fit(tracks):
    X = np.vstack([features(t) for t in tracks])
    y = np.concatenate([target(t) for t in tracks])
    _model.fit(X, y)


def predict(track):
    return _model.predict(features(track))
