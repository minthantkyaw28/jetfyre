"""Figures and the site's headline numbers.

Writes, all into out/:
  headline.json      the numbers the site fills in (missing ones are null)
  kept_changes.md    one row per kept turn
  ratchet.png        every evaluation and the best kept cost, turn by turn
  players.png/.md    best cost so far for the greedy agent, Optuna and OpenEvolve
Optuna and OpenEvolve logs are read from this folder, or from the players worktree beside it.
Run after analysis.py, and after final.py for the sealed numbers.
"""
import json
import re
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from baselines import fixed_interval  # noqa: E402

ROOT = Path(__file__).parent
OUT = ROOT / "out"
PLAYERS = ROOT.parent / "players"
C_FAILS = (250, 500, 1000)
T_GRID = np.arange(0, 81)  # the site's slider range
# Palette slots 1-3 (validated all-pairs); text stays in ink colours.
COLORS = {"Greedy agent": "#2a78d6", "Optuna": "#eb6834", "OpenEvolve": "#1baf7a"}
INK, MUTED, GRID, SURFACE = "#1f1f1e", "#6b6b68", "#e6e6e3", "#fcfcfb"


def find(name):
    for p in (ROOT / name, PLAYERS / name):
        if p.exists():
            return p
    return None


def greedy_log():
    df = pd.read_csv(ROOT / "results.tsv", sep="\t")
    df["best"] = df["mean_cost"].where(df["verdict"].isin(["baseline", "keep"])).ffill()
    # Turns marked no-op (the edit never applied) are not experiments.
    df["noop"] = df["error"].fillna("").str.startswith("no-op")
    return df


def replay_curve(preds, c_fail, with_failures=False):
    """Mean cost (and failure count) for each T in T_GRID, same rule as evaluate.replay_cost."""
    costs, fails = np.zeros(len(T_GRID)), np.zeros(len(T_GRID), dtype=int)
    for _, g in preds.groupby("unit"):
        g = g.sort_values("cycle")
        p, life = g["pred"].to_numpy()[:-1], g["life_left"].to_numpy()[:-1]  # last row has 0 left
        for j, T in enumerate(T_GRID):
            hit = np.flatnonzero(p <= T)
            costs[j] += life[hit[0]] if hit.size else c_fail
            fails[j] += 0 if hit.size else 1
    costs /= preds["unit"].nunique()
    return (costs, fails) if with_failures else costs


def frontier():
    """Mean cost against T at the base failure cost, for both models; marks each one's cheapest T."""
    fig, ax = plt.subplots(figsize=(8, 4.5), dpi=150, facecolor=SURFACE)
    lines = {"Baseline model": ("preds_baseline.csv", "#eb6834", (16, 26)), "Best model": ("preds_best.csv", "#2a78d6", (16, -20))}
    summary = {}
    for name, (fname, color, offset) in lines.items():
        if not (OUT / fname).exists():
            continue
        costs, fails = replay_curve(pd.read_csv(OUT / fname), 500, with_failures=True)
        j = int(np.argmin(costs))
        summary[name] = {"T": int(T_GRID[j]), "mean_cost": round(float(costs[j]), 2), "failures": int(fails[j])}
        ax.plot(T_GRID, costs, color=color, linewidth=2, label=name)
        ax.scatter([T_GRID[j]], [costs[j]], s=48, color=color, edgecolor=SURFACE, linewidth=2, zorder=4)
        ax.annotate(f"{name}: {costs[j]:.2f} at T = {T_GRID[j]}", (T_GRID[j], costs[j]), xytext=offset,
                    textcoords="offset points", color=INK, fontsize=9,
                    arrowprops={"arrowstyle": "-", "color": MUTED, "linewidth": 0.8})
    style(ax, "The frontier: mean cost against the pull threshold T (failure costs 500)",
          "Threshold T (pull when predicted life <= T)", "Mean cost per engine (cycles)")
    ax.set_ylim(0, 80)
    ax.legend(frameon=False, labelcolor=INK, loc="upper right")
    fig.tight_layout()
    fig.savefig(OUT / "frontier.png", facecolor=SURFACE)
    plt.close(fig)
    return summary


def best_T():
    path = OUT / "preds_best.csv"
    if not path.exists():
        return {str(c): None for c in C_FAILS}
    preds = pd.read_csv(path)
    return {str(c): int(T_GRID[np.argmin(replay_curve(preds, c))]) for c in C_FAILS}


def sealed():
    keys = {"fd001_rmse": "FD001 RMSE", "fd001_score": "FD001 NASA",
            "fd003_rmse": "FD003 RMSE", "fd003_score": "FD003 NASA"}
    path = OUT / "final.json"
    rows = json.loads(path.read_text()) if path.exists() else {}
    return {k: {m: rows.get(m, {}).get(v) for m in ("baseline", "best")} for k, v in keys.items()}


def headline(df, optuna_best, third):
    ok = df[df["verdict"].isin(["baseline", "keep"])]
    base, best = ok.iloc[0], ok.iloc[-1]
    fixed = fixed_interval()
    return {
        "mean_cost": {"fixed": round(fixed["mean_cost"], 2), "baseline": round(base["mean_cost"], 2),
                      "best": round(best["mean_cost"], 2), "optuna": optuna_best, "oracle": 0.0},
        "failures": {"fixed": fixed["failures"], "baseline": int(base["failures"]), "best": int(best["failures"])},
        "wasted_cycles": {"fixed": fixed["wasted_cycles"], "baseline": float(base["wasted_cycles"]),
                          "best": float(best["wasted_cycles"])},
        # Share of the gap between the baseline model and a perfect oracle (cost 0) that the loop closed.
        "gap_closed": round((base["mean_cost"] - best["mean_cost"]) / base["mean_cost"], 4),
        "turns": {"kept": int((df["verdict"] == "keep").sum()),
                  "total": int(((df["verdict"] != "baseline") & ~df["noop"]).sum())},
        "third_player": third,
        "sealed": sealed(),
        "best_T": best_T(),
    }


def kept_changes(df):
    lines = ["| Turn | Change | Mean cost |", "|---|---|---|"]
    for _, r in df[df["verdict"].isin(["baseline", "keep"])].iterrows():
        lines.append(f"| {r['turn']} | {str(r['hypothesis']).replace('|', '/')} | {r['mean_cost']:.2f} |")
    for _, r in df[df["noop"]].iterrows():
        lines.append(f"\nTurn {r['turn']} was a no-op re-test: its edit did not apply, so it re-ran the turn "
                     f"{r['turn'] - 1} model. It is not counted as an experiment.")
    return "\n".join(lines) + "\n"


def style(ax, title, xlabel, ylabel):
    ax.set_facecolor(SURFACE)
    ax.set_title(title, color=INK, fontsize=11, loc="left")
    ax.set_xlabel(xlabel, color=MUTED)
    ax.set_ylabel(ylabel, color=MUTED)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_ylim(bottom=0)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.tick_params(colors=MUTED)


def ratchet(df):
    fig, ax = plt.subplots(figsize=(10, 4.2), dpi=150, facecolor=SURFACE)
    tried = df[~df["noop"]].dropna(subset=["mean_cost"])
    ax.scatter(tried["turn"], tried["mean_cost"], s=22, color="#a3a39e", zorder=2, label="Every evaluated change")
    ax.plot(df["turn"], df["best"], color=COLORS["Greedy agent"], linewidth=2, drawstyle="steps-post",
            zorder=3, label="Best kept so far")
    for _, r in df[df["verdict"] == "keep"].iterrows():
        ax.scatter(r["turn"], r["mean_cost"], s=40, color=COLORS["Greedy agent"], edgecolor=SURFACE,
                   linewidth=2, zorder=4)
    style(ax, "The ratchet: mean cost per engine, turn by turn", "Turn", "Mean cost per engine (cycles)")
    ax.set_ylim(0, min(60, tried["mean_cost"].max() * 1.1))
    ax.legend(frameon=False, labelcolor=INK)
    fig.tight_layout()
    fig.savefig(OUT / "ratchet.png", facecolor=SURFACE)
    plt.close(fig)


def players(df):
    series, rows = {}, []
    t = pd.to_datetime(df["time"])
    series["Greedy agent"] = df["best"].to_numpy()
    rows.append(("Greedy agent", df["best"].iloc[-1], len(df),
                 (t.iloc[-1] - t.iloc[0]).total_seconds() + df["seconds"].iloc[0], "not metered"))
    optuna_best = third = None
    if (p := find("optuna_results.tsv")) is not None:
        o = pd.read_csv(p, sep="\t")
        series["Optuna"] = o["mean_cost"].cummin().to_numpy()
        optuna_best = round(float(o["mean_cost"].min()), 2)
        wall = o["seconds"].sum() if "seconds" in o else float("nan")
        rows.append(("Optuna", optuna_best, len(o), wall, "0"))
    if (p := find("oe_results.tsv")) is not None:
        e = pd.read_csv(p, sep="\t")
        series["OpenEvolve"] = e["mean_cost"].cummin().to_numpy()
        te = pd.to_datetime(e["time"])
        log = p.parent / "oe" / "run.log"
        calls = len(re.findall(r"Iteration \d+.*\| tokens: \d+", log.read_text())) if log.exists() else "n/a"
        third = {"name": "OpenEvolve", "mean_cost": round(float(e["mean_cost"].min()), 2)}
        rows.append(("OpenEvolve", third["mean_cost"], len(e),
                     (te.iloc[-1] - te.iloc[0]).total_seconds() + e["seconds"].iloc[0], str(calls)))

    fig, ax = plt.subplots(figsize=(8, 4.5), dpi=150, facecolor=SURFACE)
    for name, best in series.items():
        ax.plot(range(1, len(best) + 1), best, color=COLORS[name], linewidth=2, drawstyle="steps-post", label=name)
        ax.annotate(f"{name}  {best[-1]:.2f}", (len(best), best[-1]), xytext=(6, 0),
                    textcoords="offset points", va="center", color=INK, fontsize=9)
    style(ax, "Search players on the same referee (C-MAPSS FD001, 5-fold replay cost)",
          "Evaluation number", "Best mean cost per engine so far (lower is better)")
    ax.legend(frameon=False, labelcolor=INK, loc="upper right")
    fig.tight_layout()
    fig.savefig(OUT / "players.png", facecolor=SURFACE)
    plt.close(fig)

    md = ["| Player | Best mean cost | Evaluations | Wall-clock | Model calls |", "|---|---|---|---|---|"]
    md += [f"| {n} | {b:.2f} | {k} | {w / 60:.1f} min | {c} |" for n, b, k, w, c in rows]
    (OUT / "players.md").write_text("\n".join(md) + "\n")
    return optuna_best, third or {"name": None, "mean_cost": None}


def main():
    OUT.mkdir(exist_ok=True)
    df = greedy_log()
    ratchet(df)
    print("frontier (cheapest T at failure cost 500):", json.dumps(frontier()))
    optuna_best, third = players(df)
    (OUT / "kept_changes.md").write_text(kept_changes(df))
    (OUT / "headline.json").write_text(json.dumps(headline(df, optuna_best, third), indent=1))
    print((OUT / "headline.json").read_text())


if __name__ == "__main__":
    main()
