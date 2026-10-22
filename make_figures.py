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


BEST_T, BASE_T = 7, 30
AMBER_L, RED_L = "#c98500", "#c8102e"  # caution and warning, light-surface steps


def pull_rows(preds, T):
    """Per engine: (unit, life, pull row or None, cycles left at the pull)."""
    out = []
    for u, g in preds.groupby("unit"):
        g = g.sort_values("cycle")
        hit = np.flatnonzero((g["pred"].to_numpy() <= T) & (g["life_left"].to_numpy() > 0))
        out.append((int(u), len(g), int(hit[0]) if hit.size else None,
                    int(g["life_left"].to_numpy()[hit[0]]) if hit.size else 0))
    return out


def story_unit(preds):
    """A held-out engine of median life that the best model pulls."""
    rows = [r for r in pull_rows(preds, BEST_T) if r[2] is not None]
    rows.sort(key=lambda r: r[1])
    return rows[len(rows) // 2][0]


def scarcity():
    """Mean cost against T for the best model at each failure price; marks the cheapest T."""
    if not (OUT / "preds_best.csv").exists():
        return
    preds = pd.read_csv(OUT / "preds_best.csv")
    fig, ax = plt.subplots(figsize=(8, 4.5), dpi=150, facecolor=SURFACE)
    for c, color, offset in [(250, "#1baf7a", (10, -16)), (500, "#2a78d6", (10, 8)), (1000, "#6250d6", (10, 24))]:
        costs = replay_curve(preds, c)
        j = int(np.argmin(costs))
        ax.plot(T_GRID, costs, color=color, linewidth=2, label=f"Failure costs {c}")
        ax.scatter([T_GRID[j]], [costs[j]], s=44, color=color, edgecolor=SURFACE, linewidth=2, zorder=4)
        ax.annotate(f"{c}: cheapest T = {T_GRID[j]}, cost {costs[j]:.2f}", (T_GRID[j], costs[j]), xytext=offset,
                    textcoords="offset points", fontsize=9, color=INK)
    style(ax, "Scarcity: the best model's cost against T, at three failure prices",
          "Threshold T (pull when predicted life <= T)", "Mean cost per engine (cycles)")
    ax.set_ylim(0, 60)
    ax.set_xlim(0, 30)
    ax.legend(frameon=False, labelcolor=INK, loc="upper right")
    fig.tight_layout()
    fig.savefig(OUT / "scarcity.png", facecolor=SURFACE)
    plt.close(fig)


def fleet_strip():
    """One bar per held-out engine: cycles left when the best model pulled it; failures in red."""
    if not (OUT / "preds_best.csv").exists():
        return
    rows = pull_rows(pd.read_csv(OUT / "preds_best.csv"), BEST_T)
    pulled = sorted([r for r in rows if r[2] is not None], key=lambda r: -r[3])
    failed = [r for r in rows if r[2] is None]
    fig, ax = plt.subplots(figsize=(10, 3.6), dpi=150, facecolor=SURFACE)
    x = np.arange(len(pulled) + len(failed))
    ax.bar(x[:len(pulled)], [r[3] for r in pulled], width=0.8, color=AMBER_L, edgecolor=SURFACE, linewidth=0.6)
    if failed:
        ax.bar(x[len(pulled):], [-8] * len(failed), width=0.8, color=RED_L)
    style(ax, f"The fleet: cycles left at the pull, all {len(rows)} held-out engines, best model (T = {BEST_T})",
          f"Engines, sorted ({len(pulled)} pulled, {len(failed)} ran to failure)", "Cycles left at the pull")
    ax.set_xticks([])
    ax.axhline(0, color=MUTED, linewidth=0.8)
    fig.tight_layout()
    fig.savefig(OUT / "fleet_strip.png", facecolor=SURFACE)
    plt.close(fig)


def engine_story():
    """One held-out engine: true life left and both models' predictions, with each model's pull."""
    if not all((OUT / f).exists() for f in ("preds_best.csv", "preds_baseline.csv")):
        return
    best, base = pd.read_csv(OUT / "preds_best.csv"), pd.read_csv(OUT / "preds_baseline.csv")
    u = story_unit(best)
    fig, ax = plt.subplots(figsize=(8, 4.5), dpi=150, facecolor=SURFACE)
    g = best[best["unit"] == u].sort_values("cycle")
    ax.plot(g["cycle"], g["life_left"], color=MUTED, linewidth=1.5, linestyle="--", label="True life left")
    for name, df, T, color in [("Baseline model", base, BASE_T, "#eb6834"), ("Best model", best, BEST_T, "#2a78d6")]:
        h = df[df["unit"] == u].sort_values("cycle")
        ax.plot(h["cycle"], h["pred"], color=color, linewidth=2, label=f"{name}, pulls at T = {T}")
        hit = np.flatnonzero((h["pred"].to_numpy() <= T) & (h["life_left"].to_numpy() > 0))
        if hit.size:
            c, left = int(h["cycle"].iloc[hit[0]]), int(h["life_left"].iloc[hit[0]])
            ax.scatter([c], [h["pred"].iloc[hit[0]]], s=50, color=color, edgecolor=SURFACE, linewidth=2, zorder=4)
            ax.annotate(f"pulled at cycle {c}, {left} left", (c, h["pred"].iloc[hit[0]]), xytext=(-150, 18) if T > 10 else (-270, 2),
                        textcoords="offset points", fontsize=9, color=INK,
                        arrowprops={"arrowstyle": "-", "color": MUTED, "linewidth": 0.8})
    style(ax, f"One engine, start to finish (held-out engine {u})", "Cycle", "Cycles of life left")
    ax.set_ylim(0, 160)
    ax.legend(frameon=False, labelcolor=INK, loc="upper right")
    fig.tight_layout()
    fig.savefig(OUT / "engine_story.png", facecolor=SURFACE)
    plt.close(fig)


def sealed_replay():
    """The sealed FD003 replay from final.py: failures and cost at each price, baseline against best."""
    path = OUT / "final.json"
    if not path.exists():
        return
    rows = json.loads(path.read_text())
    if not all("fd003_replay" in rows.get(m, {}) for m in ("baseline", "best")):
        return
    prices = list(rows["best"]["fd003_replay"])
    fig, axes = plt.subplots(1, 2, figsize=(10, 4), dpi=150, facecolor=SURFACE)
    x = np.arange(len(prices))
    for i, (name, color) in enumerate([("baseline", "#eb6834"), ("best", "#2a78d6")]):
        rep = rows[name]["fd003_replay"]
        label = f"{name.capitalize()} model (T = {rows[name]['T']:g})"
        axes[0].bar(x + (i - 0.5) * 0.38, [rep[p]["mean_cost"] for p in prices], width=0.36, color=color, label=label)
        axes[1].bar(i, rep[prices[0]]["failures"], width=0.6, color=color)
        axes[1].annotate(f"{rep[prices[0]]['failures']} of {rep[prices[0]]['engines']}", (i, rep[prices[0]]["failures"]),
                         xytext=(0, 4), textcoords="offset points", ha="center", fontsize=10, color=INK)
    style(axes[0], "Sealed FD003: mean cost per engine", "Failure price", "Mean cost per engine (cycles)")
    axes[0].set_xticks(x, prices)
    axes[0].legend(frameon=False, labelcolor=INK, fontsize=8)
    style(axes[1], "Sealed FD003: engines that ran to failure", "", "Failures")
    axes[1].set_xticks([0, 1], ["Baseline", "Best"])
    fig.tight_layout()
    fig.savefig(OUT / "sealed_test.png", facecolor=SURFACE)
    plt.close(fig)


def model_story():
    """out/model_story.json: one held-out engine traced through model.py, for the site's visual."""
    from prepare import TRAIN, load_tracks
    if not (OUT / "preds_best.csv").exists():
        return
    best = pd.read_csv(OUT / "preds_best.csv")
    u = story_unit(best)
    g = best[best["unit"] == u].sort_values("cycle")
    track = load_tracks(TRAIN)[u]
    hit = np.flatnonzero((g["pred"].to_numpy() <= BEST_T) & (g["life_left"].to_numpy() > 0))[0]
    story = {
        "unit": u, "sensor": "s4", "sensor_label": "temperature at the low-pressure turbine outlet",
        "cycle": g["cycle"].astype(int).tolist(),
        "raw": track["s4"].round(2).tolist(),
        "smooth": track["s4"].rolling(10, min_periods=1).mean().round(2).tolist(),
        "life_left": g["life_left"].astype(int).tolist(), "pred": g["pred"].round(2).tolist(),
        "T": BEST_T, "window": 10, "life_cap": 125, "end_weight": 5, "end_rows": 30, "quantile": 0.35,
        "pull_cycle": int(g["cycle"].iloc[hit]), "left_at_pull": int(g["life_left"].iloc[hit]),
    }
    final = OUT / "final.json"
    if final.exists():
        final_rows = json.loads(final.read_text())
        rep = final_rows.get("best", {}).get("fd003_replay", {}).get("500")
        base = final_rows.get("baseline", {}).get("fd003_replay", {}).get("500")
        if rep:
            story["fd003_failures"], story["fd003_engines"] = rep["failures"], rep["engines"]
        if base:
            story["fd003_failures_baseline"] = base["failures"]
    story["T_baseline"] = BASE_T
    fleet = OUT / "fleet.json"
    if fleet.exists():
        for r in json.loads(fleet.read_text()):
            if r["capacity"] == "2 a week" and r["policy"] == "threshold":
                key = "baseline" if r["model"].startswith("Baseline") else "best"
                story[f"cap2_cost_{key}"], story[f"cap2_fail_{key}"] = round(r["mean_cost"], 2), r["failures"]
    (OUT / "model_story.json").write_text(json.dumps(story))


def hero_animation(n_engines=12, T=7, step=3):
    """out/hero.gif (and a still, hero.png): held-out engines run cycle by cycle under the best model."""
    from matplotlib.animation import FuncAnimation, PillowWriter
    path = OUT / "preds_best.csv"
    if not path.exists():
        return
    preds = pd.read_csv(path)
    lives = preds.groupby("unit")["life_left"].max() + 1
    units = lives.sort_values().index[np.linspace(0, len(lives) - 1, n_engines).round().astype(int)]
    rows = []
    for u in units:
        g = preds[preds["unit"] == u].sort_values("cycle")
        hit = np.flatnonzero((g["pred"].to_numpy() <= T) & (g["life_left"].to_numpy() > 0))
        life = int(lives[u])
        rows.append({"life": life, "stop": int(hit[0]) + 1 if hit.size else life,
                     "left": int(g["life_left"].to_numpy()[hit[0]]) if hit.size else 0, "failed": not hit.size})
    BG, TRACK, RULE, AMBER, RED, INK_D, MUTED_D, FILL = ("#0f1c28", "#132433", "#2d4050", "#ffbf3c",
                                                          "#ff6b6b", "#e4eaf0", "#a7b6c4", "#3b5770")
    xmax = max(r["life"] for r in rows) + 95
    n = len(rows)
    fig = plt.figure(figsize=(9.6, 4.6), dpi=100, facecolor=BG)
    ax = fig.add_axes([0.02, 0.1, 0.96, 0.78])
    ax.set_facecolor(BG)
    ax.set_xlim(0, xmax)
    ax.set_ylim(-0.6, n - 0.4)
    ax.axis("off")
    for i, r in enumerate(rows):
        y = n - 1 - i
        ax.add_patch(plt.Rectangle((0, y - 0.28), r["life"], 0.56, color=TRACK, ec=RULE, lw=0.6))
        ax.add_patch(plt.Rectangle((r["life"] - 5, y - 0.28), 5, 0.56, color=RED))
    fills = [ax.add_patch(plt.Rectangle((0, n - 1 - i - 0.28), 0, 0.56, color=FILL)) for i in range(n)]
    marks = [ax.plot([], [], color=AMBER, lw=3, solid_capstyle="round")[0] for _ in rows]
    labels = [ax.text(0, n - 1 - i, "", va="center", fontsize=9, color=AMBER) for i in range(n)]
    title = fig.text(0.02, 0.93, "", color=INK_D, fontsize=13, weight="bold")
    tally = fig.text(0.02, 0.03, "", color=MUTED_D, fontsize=10)
    end = max(r["stop"] for r in rows)
    frames = list(range(0, end + step, step)) + [end] * 30

    def draw(t):
        pulled = failed = wasted = 0
        for i, r in enumerate(rows):
            y = n - 1 - i
            fills[i].set_width(min(t, r["stop"]))
            if t >= r["stop"]:
                if r["failed"]:
                    failed += 1
                    labels[i].set_text("ran to failure")
                    labels[i].set_color(RED)
                else:
                    pulled += 1
                    wasted += r["left"]
                    marks[i].set_data([r["stop"], r["stop"]], [y - 0.38, y + 0.38])
                    labels[i].set_text(f"pulled, {r['left']} cycle{'s' * (r['left'] != 1)} left")
                labels[i].set_x(r["life"] + 4)
        title.set_text(f"Best model on held-out engines, cycle {min(t, end)}")
        tally.set_text(f"pulled {pulled}    failed {failed}    cycles thrown away {wasted}")

    FuncAnimation(fig, draw, frames=frames).save(OUT / "hero.gif", writer=PillowWriter(fps=18))
    draw(end)
    fig.savefig(OUT / "hero.png", facecolor=BG)
    plt.close(fig)


def main():
    OUT.mkdir(exist_ok=True)
    hero_animation()
    scarcity()
    fleet_strip()
    engine_story()
    sealed_replay()
    model_story()
    df = greedy_log()
    ratchet(df)
    print("frontier (cheapest T at failure cost 500):", json.dumps(frontier()))
    optuna_best, third = players(df)
    (OUT / "kept_changes.md").write_text(kept_changes(df))
    (OUT / "headline.json").write_text(json.dumps(headline(df, optuna_best, third), indent=1))
    print((OUT / "headline.json").read_text())


if __name__ == "__main__":
    main()
