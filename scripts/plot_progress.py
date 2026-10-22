"""results.tsv -> reports/progress.png: mean cost per turn, keeps highlighted, running best line."""
import csv
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TSV = ROOT / "results.tsv"
OUT = ROOT / "reports" / "progress.png"


def load():
    if not TSV.exists():
        sys.exit("no results.tsv yet")
    with TSV.open() as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    pts = []
    for i, r in enumerate(rows):
        try:
            cost = float(r.get("mean_cost", "nan"))
        except ValueError:
            cost = float("nan")
        verdict = (r.get("verdict") or "").strip().lower()
        turn = r.get("turn") or str(i)
        pts.append((int(float(turn)) if turn.replace(".", "").isdigit() else i, cost,
                    verdict, r.get("hypothesis", "")))
    return pts


def is_keep(v):
    return v.startswith("keep") or v.startswith("baseline")


def running_best(pts):
    best, out = math.inf, []
    for _, c, v, _ in pts:
        if is_keep(v) and math.isfinite(c):
            best = min(best, c)
        out.append(best if math.isfinite(best) else float("nan"))
    return out


def ascii_plot(pts, best):
    print(f"{'turn':>4}  {'cost':>8}  {'best':>8}  verdict   hypothesis")
    for (t, c, v, h), b in zip(pts, best):
        print(f"{t:>4}  {c:>8.2f}  {b:>8.2f}  {v[:8]:<8}  {h[:60]}")


def main():
    pts = load()
    if not pts:
        sys.exit("results.tsv is empty")
    best = running_best(pts)
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        ascii_plot(pts, best)
        return

    turns = [p[0] for p in pts]
    finite = [p for p in pts if math.isfinite(p[1])]
    kept = [p for p in finite if is_keep(p[2])]
    rej = [p for p in finite if not is_keep(p[2])]
    lost = [p for p in pts if not math.isfinite(p[1])]

    fig, ax = plt.subplots(figsize=(10, 5), dpi=130)
    ax.scatter([p[0] for p in rej], [p[1] for p in rej], s=28, c="#9aa0a6", label="reverted", zorder=2)
    ax.scatter([p[0] for p in kept], [p[1] for p in kept], s=60, c="#e8710a", edgecolors="black",
               linewidths=0.6, label="kept (git commit)", zorder=3)
    ax.step(turns, best, where="post", c="#1a73e8", lw=2, label="running best", zorder=1)
    if lost:
        top = max([p[1] for p in finite], default=1.0)
        ax.scatter([p[0] for p in lost], [top] * len(lost), marker="x", c="#d93025",
                   label="loss (leak / timeout / guard)", zorder=3)
    for t, c, v, h in kept:
        ax.annotate(h[:28], (t, c), textcoords="offset points", xytext=(4, 6), fontsize=6.5, color="#5f6368")
    ax.set_xlabel("turn")
    ax.set_ylabel("mean replay cost per engine (cycles)  ↓ better")
    ax.set_title("Jetfyre autoresearch — FD001 5-fold replay cost (wasted life + 500 × failures)")
    ax.grid(alpha=0.3)
    ax.legend(loc="upper right", fontsize=8)
    fig.tight_layout()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT)
    print(f"wrote {OUT.relative_to(ROOT)}  ({len(pts)} turns, {len(kept)} kept, best {best[-1]:.2f})")


if __name__ == "__main__":
    main()
