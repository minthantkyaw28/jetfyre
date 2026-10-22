"""Control arm: Optuna tunes a raw-feature HGB on the same folds and cost.

Does not import model.py. Logs every trial to optuna_results.tsv.
"""
import csv

import numpy as np
import optuna
from sklearn.ensemble import HistGradientBoostingRegressor

from evaluate import replay_cost
from prepare import TRAIN, get_folds, load_tracks

FEATURES = ["setting_1", "setting_2", "setting_3"] + [f"s{i}" for i in range(1, 22)] + ["cycle"]
N_TRIALS = 30
TRACKS = load_tracks(TRAIN)
FOLDS = get_folds()


def life_left(track, cap):
    return np.minimum(len(track) - 1 - np.arange(len(track)), cap).astype(float)


def objective(trial):
    p = {"learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
         "max_depth": trial.suggest_int("max_depth", 2, 12),
         "max_iter": trial.suggest_int("max_iter", 50, 500)}
    cap = trial.suggest_int("life_cap", 100, 150)
    T = trial.suggest_float("T", 5, 60)
    fold_costs = []
    for fold in FOLDS:
        train = [TRACKS[u] for u in TRACKS if u not in fold]
        model = HistGradientBoostingRegressor(random_state=0, **p)
        model.fit(np.vstack([t[FEATURES].to_numpy(float) for t in train]),
                  np.concatenate([life_left(t, cap) for t in train]))
        costs = [replay_cost(model.predict(TRACKS[u][FEATURES].to_numpy(float)), T)[0] for u in fold]
        fold_costs.append(float(np.mean(costs)))
    trial.set_user_attr("fold_costs", fold_costs)
    return float(np.mean(fold_costs))


def main():
    study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=0))
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    study.optimize(objective, n_trials=N_TRIALS)
    with open("optuna_results.tsv", "w", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(["trial", *study.trials[0].params, "fold_costs", "mean_cost"])
        for t in study.trials:
            w.writerow([t.number, *t.params.values(),
                        [round(c, 2) for c in t.user_attrs["fold_costs"]], round(t.value, 3)])
    print(f"best mean cost {study.best_value:.2f} with {study.best_params}")


if __name__ == "__main__":
    main()
