"""FIXED. One autoresearch turn: guard -> evaluate -> keep (git commit) or revert (git checkout) -> log.

Usage: .venv/bin/python loop.py "one-line hypothesis"

Keep only if mean replay cost falls AND the change wins on >= 4 of 5 folds.
A leak, an error, a run over 60s, or touching anything but model.py is a loss.
The hypothesis, fold costs and verdict go into results.tsv either way.
"""
import ast
import json
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from evaluate import keep  # noqa: E402

RESULTS, BEST = ROOT / "results.tsv", ROOT / "best.json"
COLS = ["turn", "time", "hypothesis", "status", "verdict", "mean_cost", "best_before",
        "f1", "f2", "f3", "f4", "f5", "wins", "fails", "waste", "rmse125", "nasa100", "T", "secs"]
FIXED = ["evaluate.py", "prepare.py", "loop.py", "final_eval.py", "data/", "models/baseline.py"]
HARNESS_TAG = "harness-v1"  # fixed files must match this tag
AGENT_WRITABLE = ("model.py", "memory/", "runs/", "reports/")
ALLOWED_IMPORTS = {"numpy", "pandas", "sklearn", "lightgbm", "scipy", "math", "warnings",
                   "dataclasses", "functools", "itertools", "collections", "typing", "__future__"}
FORBIDDEN = ["locked", "FD00", "folds", "prepare", "evaluate", "open(", "exec(", "eval(",
             "__import__", "globals(", "sys.modules", "__builtins__", "read_csv", "read_table", "loadtxt"]
GIT_ID = ["-c", "user.name=autoresearch-loop", "-c", "user.email=loop@jetfyre.local"]


def git(*args, check=True):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=check).stdout


def guard():
    """Returns a violation message, or None if the turn is clean."""
    changed = [l[3:].strip('"') for l in git("status", "--porcelain", "--untracked-files=all").splitlines()]
    bad = [p for p in changed if p != "results.tsv" and not p.startswith(AGENT_WRITABLE)]
    if bad:
        return f"touched files outside model.py: {bad[:5]}"
    if git("tag", "-l", HARNESS_TAG).strip():
        drift = git("diff", "--name-only", HARNESS_TAG, "HEAD", "--", *FIXED).split()
        if drift:
            return f"fixed files differ from {HARNESS_TAG}: {drift}"
    src = (ROOT / "model.py").read_text()
    for tok in FORBIDDEN:
        if tok in src:
            return f"model.py uses forbidden token {tok!r}"
    try:
        tree = ast.parse(src)
    except SyntaxError as e:
        return f"model.py does not parse: {e}"
    for node in ast.walk(tree):
        names = [a.name for a in node.names] if isinstance(node, ast.Import) else \
                [node.module or ""] if isinstance(node, ast.ImportFrom) else []
        for n in names:
            if n.split(".")[0] not in ALLOWED_IMPORTS:
                return f"model.py imports {n!r}; allowed: {sorted(ALLOWED_IMPORTS)}"
    return None


def evaluate():
    try:
        p = subprocess.run([sys.executable, "evaluate.py", "--out", "runs/last_eval.json"],
                           cwd=ROOT, capture_output=True, text=True, timeout=90)
        return json.loads(p.stdout.strip().splitlines()[-1])
    except subprocess.TimeoutExpired:
        return {"status": "timeout", "secs": 90}
    except Exception as e:
        return {"status": "error", "error": f"evaluator output unreadable: {e}"}


def main():
    hyp = re.sub(r"\s+", " ", " ".join(sys.argv[1:])).strip()
    if not hyp:
        sys.exit('usage: loop.py "one-line hypothesis"')
    if not RESULTS.exists():
        RESULTS.write_text("\t".join(COLS) + "\n")
    turn = sum(1 for _ in RESULTS.open()) - 1
    best = json.loads(BEST.read_text()) if BEST.exists() else None

    violation = guard()
    res = {"status": "violation", "error": violation} if violation else evaluate()
    ok = res.get("status") == "ok"
    if best is None:
        verdict = "baseline" if ok else res.get("status", "error")
    elif not ok:
        verdict = res.get("status", "error")
    else:
        verdict = "keep" if keep(res["fold_costs"], best["fold_costs"]) else "discard"
    folds = res.get("fold_costs", [""] * 5)
    wins = int(sum(n < b for n, b in zip(folds, best["fold_costs"]))) if ok and best else ""

    tag = f"{turn:04d}_{verdict}"
    (ROOT / "runs").mkdir(exist_ok=True)
    diff = git("diff", "HEAD", "--", "model.py", check=False) if best else (ROOT / "model.py").read_text()
    (ROOT / "runs" / f"{tag}.diff").write_text(diff)

    row = [turn, time.strftime("%H:%M:%S"), hyp, res.get("status"), verdict, res.get("mean_cost", ""),
           best["mean_cost"] if best else "", *folds, wins, res.get("fails", ""), res.get("waste", ""),
           res.get("rmse125", ""), res.get("nasa100", ""), res.get("T", ""), res.get("secs", "")]
    with RESULTS.open("a") as f:
        f.write("\t".join(str(x) for x in row) + "\n")

    if verdict in ("keep", "baseline"):
        BEST.write_text(json.dumps({"turn": turn, "hypothesis": hyp, **res}, indent=1))
        msg = f"{verdict} {turn:04d}: {hyp} | cost {res['mean_cost']}" + (f" (was {best['mean_cost']})" if best else "")
    else:
        git("checkout", "HEAD", "--", "model.py")  # revert the experiment
        msg = f"{verdict} {turn:04d}: {hyp} | cost {res.get('mean_cost', '-')} vs best {best['mean_cost'] if best else '-'}"
    git("add", "-A", "model.py", "results.tsv", "best.json", "runs/", "memory/", check=False)
    git(*GIT_ID, "commit", "-q", "-m", msg, check=False)

    print(json.dumps({"turn": turn, "verdict": verdict, "mean_cost": res.get("mean_cost"),
                      "best_before": best["mean_cost"] if best else None, "fold_costs": folds,
                      "wins": wins, "fails": res.get("fails"), "waste": res.get("waste"),
                      "rmse125": res.get("rmse125"), "secs": res.get("secs"),
                      "error": res.get("error")}))
    print(f"[{verdict.upper()}] {msg}")


if __name__ == "__main__":
    main()
