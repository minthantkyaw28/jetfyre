"""EDITABLE. The only file the research agent changes: features, model, loss, pull threshold T.

Contract (enforced by the evaluator):
  T                    pull the engine the first cycle predicted RUL <= T.
  Model().fit(tracks)  tracks: list of DataFrames, one engine each, new -> failure.
  Model().predict(track) -> np.ndarray, one RUL guess per row, CAUSAL:
                       row i may only use rows <= i (checked by cutting tracks).
Columns: unit, cycle, os1, os2, os3, s1..s21.
"""
import lightgbm as lgb
import numpy as np
import pandas as pd

T = 30.0  # pull threshold, in cycles of predicted remaining life

SETTINGS = ["os1", "os2", "os3"]
SENSORS = [f"s{i}" for i in range(1, 22)]


def features(track: pd.DataFrame) -> pd.DataFrame:
    return track[SETTINGS + SENSORS]


def target(track: pd.DataFrame) -> np.ndarray:
    return len(track) - np.arange(1, len(track) + 1)  # true cycles left


class Model:
    def fit(self, tracks):
        X = pd.concat([features(t) for t in tracks], ignore_index=True)
        y = np.concatenate([target(t) for t in tracks])
        self.m = lgb.LGBMRegressor(n_estimators=200, learning_rate=0.05, num_leaves=31,
                                   random_state=0, n_jobs=4, verbose=-1)
        self.m.fit(X, y)
        return self

    def predict(self, track):
        return self.m.predict(features(track))
