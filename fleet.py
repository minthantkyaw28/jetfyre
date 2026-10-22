"""Fleet operations: the same pull decisions, but the shop can only take k engines a week.

Usage: python fleet.py [--c-fail N]
Reads out/preds_baseline.csv and out/preds_best.csv (held-out predictions from analysis.py).
The 100 engines enter service at staggered, seeded times. Each cycle, engines whose predicted life
is at or below T ask to be pulled; the shop takes the most urgent first, up to k a week. An engine
still flying when its life runs out fails. With unlimited capacity this is exactly evaluate.py's
replay cost, which is checked on every run.

Two policies:
  threshold       pull when pred <= T, if a slot is free
  capacity-aware  the same, and when slots are free, also pull engines due within the next week
Writes out/fleet.png and out/fleet.md.
"""
import argparse
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

OUT = Path(__file__).parent / "out"
MODELS = {"Baseline model": ("preds_baseline.csv", 30), "Best model": ("preds_best.csv", 7)}
CAPACITIES = [1, 2, 3, None]  # engines per 7-cycle week; None is unlimited
WEEK = 7
ENTRY_SPREAD = 250  # engines enter service at a seeded random cycle in [0, 250)


def load(fname):
    preds = pd.read_csv(OUT / fname).sort_values(["unit", "cycle"])
    return {int(u): (g["pred"].to_numpy(), g["life_left"].to_numpy()) for u, g in preds.groupby("unit")}


def simulate(engines, T, k, c_fail, lookahead=0, seed=0):
    rng = np.random.default_rng(seed)
    start = {u: int(rng.integers(0, ENTRY_SPREAD)) for u in sorted(engines)}
    flying, cost, fails, wasted, used = set(engines), 0.0, 0, 0.0, 0
    for t in range(max(start[u] + len(engines[u][0]) for u in engines) + 1):
        if t % WEEK == 0:
            used = 0
        due, extra = [], []
        for u in list(flying):
            r = t - start[u]
            if r < 0:
                continue
            pred, left = engines[u]
            if left[r] == 0:  # ran out of life while still flying
                flying.discard(u); cost += c_fail; fails += 1
            elif pred[r] <= T:
                due.append((pred[r], u, left[r]))
            elif lookahead and pred[r] <= T + lookahead:
                extra.append((pred[r], u, left[r]))
        queue = sorted(due) + (sorted(extra) if lookahead else [])
        for _, u, left in queue:
            if k is not None and used >= k:
                break
            flying.discard(u); used += 1; cost += left; wasted += left
    n = len(engines)
    return {"mean_cost": cost / n, "failures": fails, "mean_wasted": wasted / n}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--c-fail", type=float, default=500.0)
    args = ap.parse_args()
    rows = []
    for name, (fname, T) in MODELS.items():
        engines = load(fname)
        # Unlimited capacity must equal the plain replay (first row with pred <= T and life left).
        direct = np.mean([left[np.flatnonzero((p <= T) & (left > 0))[0]] if ((p <= T) & (left > 0)).any()
                          else args.c_fail for p, left in engines.values()])
        sim = simulate(engines, T, None, args.c_fail)["mean_cost"]
        assert abs(sim - direct) < 1e-9, (name, sim, direct)
        for k in CAPACITIES:
            for policy, look in [("threshold", 0), ("capacity-aware", WEEK)]:
                r = simulate(engines, T, k, args.c_fail, lookahead=look)
                rows.append({"model": name, "T": T, "capacity": "unlimited" if k is None else f"{k} a week",
                             "policy": policy, **r})
    df = pd.DataFrame(rows)

    fig, ax = plt.subplots(figsize=(8, 4.5), dpi=150, facecolor="#fcfcfb")
    colors = {"Baseline model": "#eb6834", "Best model": "#2a78d6"}
    labels = [c for c in df["capacity"].unique()]
    x = np.arange(len(labels))
    for name in MODELS:
        for policy, style in [("threshold", "-"), ("capacity-aware", "--")]:
            d = df[(df["model"] == name) & (df["policy"] == policy)]
            ax.plot(x, d["mean_cost"], style, marker="o", color=colors[name], linewidth=2, label=f"{name}, {policy}")
    ax.set_xticks(x, labels)
    ax.set_facecolor("#fcfcfb")
    ax.set_title(f"Shop capacity: mean cost per engine (failure costs {args.c_fail:g})", color="#1f1f1e", fontsize=11, loc="left")
    ax.set_xlabel("Shop capacity", color="#6b6b68")
    ax.set_ylabel("Mean cost per engine (cycles)", color="#6b6b68")
    ax.set_ylim(bottom=0)
    ax.grid(axis="y", color="#e6e6e3", linewidth=0.8)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.legend(frameon=False, fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "fleet.png", facecolor="#fcfcfb")

    md = ["| Model | Capacity | Policy | Mean cost | Failures | Mean wasted |", "|---|---|---|---|---|---|"]
    md += [f"| {r.model} (T={r.T}) | {r.capacity} | {r.policy} | {r.mean_cost:.2f} | {r.failures} | {r.mean_wasted:.2f} |"
           for r in df.itertuples()]
    (OUT / "fleet.md").write_text("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
