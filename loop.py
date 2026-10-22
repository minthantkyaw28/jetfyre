"""One autoresearch turn: python loop.py "one-line hypothesis"."""
import csv
import json
import subprocess
import sys
import time
from pathlib import Path

BEST = Path("best.json")
RESULTS = Path("results.tsv")
HEADER = ["time", "turn", "commit", "hypothesis", "fold_costs", "mean_cost",
          "failures", "wasted_cycles", "seconds", "verdict", "error"]


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout.strip()


def run_eval():
    try:
        p = subprocess.run([sys.executable, "evaluate.py"], capture_output=True, text=True, timeout=75)
        return json.loads(p.stdout.strip().splitlines()[-1])
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "evaluate.py timed out after 75 seconds"}
    except (json.JSONDecodeError, IndexError):
        return {"ok": False, "error": f"no JSON from evaluate.py: {p.stderr.strip()[-300:]}"}


def commit(message):
    git("add", "model.py")
    git("commit", "-m", message, "--", "model.py")
    return git("rev-parse", "--short", "HEAD")


def main(hypothesis):
    hypothesis = " ".join(hypothesis.split())
    r = run_eval()
    sha = "-"
    if not r.get("ok"):
        git("checkout", "--", "model.py") if BEST.exists() else None
        verdict = "error"
    elif not BEST.exists():
        BEST.write_text(json.dumps(r["fold_costs"]))
        sha, verdict = commit("baseline"), "baseline"
    else:
        from evaluate import keep
        if keep(r["fold_costs"], json.loads(BEST.read_text())):
            sha = commit(f"keep: {hypothesis} (mean {r['mean_cost']:.2f})")
            BEST.write_text(json.dumps(r["fold_costs"]))
            verdict = "keep"
        else:
            git("checkout", "--", "model.py")
            verdict = "revert"

    new = not RESULTS.exists()
    turn = 1 if new else sum(1 for _ in RESULTS.open()) 
    with RESULTS.open("a", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        if new:
            w.writerow(HEADER)
        folds = r.get("fold_costs") or []
        w.writerow([time.strftime("%Y-%m-%d %H:%M:%S"), turn, sha, hypothesis,
                    json.dumps([round(c, 2) for c in folds]), r.get("mean_cost"),
                    r.get("failures"), r.get("wasted_cycles"), r.get("seconds"),
                    verdict, r.get("error") or ""])
    mean = f"{r['mean_cost']:.2f}" if r.get("mean_cost") is not None else "n/a"
    print(f"turn {turn} {verdict}: mean {mean} | {hypothesis}" + (f" | {r['error']}" if r.get("error") else ""))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit('usage: python loop.py "one-line hypothesis"')
    main(sys.argv[1])
