#!/usr/bin/env bash
# Headless autoresearch loop: one fresh-context `claude -p` per turn, following program.md.
# Usage: scripts/autoresearch.sh [MINUTES=60] [MAX_TURNS=40]
#   env: MODEL=<claude model alias/id> (optional), TURN_CAP=<seconds per turn, default 240>
set -uo pipefail

MINUTES="${1:-60}"
MAX_TURNS="${2:-40}"
TURN_CAP="${TURN_CAP:-240}"

cd "$(dirname "$0")/.." || exit 1
mkdir -p runs

PROMPT='You are the Jetfyre RESEARCH agent. Do exactly ONE autoresearch turn following program.md, AGENTS.md and .claude/skills/autoresearch-turn/SKILL.md:
1) read memory/insights.md, the last 15 rows of results.tsv (tail -n 15 results.tsv) and model.py;
2) choose ONE untried one-line hypothesis;
3) edit ONLY model.py;
4) run: .venv/bin/python loop.py "<your hypothesis>";
5) append one line to memory/insights.md with the verdict and lesson.
Never read locked/, never touch git, never edit any other file. Stop after step 5.'

MODEL_ARGS=()
if [[ -n "${MODEL:-}" ]]; then MODEL_ARGS=(--model "$MODEL"); fi

deadline=$(( $(date +%s) + MINUTES * 60 ))
start_rows=$( [[ -f results.tsv ]] && wc -l < results.tsv | tr -d ' ' || echo 0 )

echo "autoresearch: ${MINUTES} min, max ${MAX_TURNS} turns, cap ${TURN_CAP}s/turn"

for (( i = 1; i <= MAX_TURNS; i++ )); do
  now=$(date +%s)
  if (( now >= deadline )); then echo "time is up after $((i - 1)) turns"; break; fi

  n=$( [[ -f results.tsv ]] && wc -l < results.tsv | tr -d ' ' || echo 0 )
  log=$(printf "runs/agent_turn_%04d.log" "$n")
  echo "=== turn $i (results rows: $n) $(date '+%H:%M:%S') → $log"

  claude -p "$PROMPT" \
    --settings .claude/research-settings.json \
    ${MODEL_ARGS[@]+"${MODEL_ARGS[@]}"} \
    --permission-mode acceptEdits \
    --allowedTools "Read" "Edit(./model.py)" "Edit(./memory/insights.md)" \
      "Bash(.venv/bin/python loop.py:*)" "Bash(tail:*)" "Bash(git log:*)" "Bash(git diff:*)" \
    --disallowedTools "Read(./locked/**)" "Write" "Bash(git commit:*)" "Bash(git reset:*)" "Bash(git checkout:*)" \
    > "$log" 2>&1 &
  pid=$!
  ( sleep "$TURN_CAP"; kill "$pid" 2>/dev/null && echo "turn $i killed after ${TURN_CAP}s" >> "$log" ) >/dev/null 2>&1 &
  watchdog=$!
  wait "$pid"
  kill "$watchdog" 2>/dev/null; wait "$watchdog" 2>/dev/null

  # If the agent edited model.py but never ran loop.py, discard the stray edit.
  if git rev-parse --verify -q HEAD >/dev/null && ! git diff --quiet -- model.py; then
    echo "  stray model.py edit (no verdict) → reverting"
    git checkout -- model.py
  fi

  tail -n 1 results.tsv 2>/dev/null | cut -f1,3,5,6 | sed 's/^/  last: /'
done

end_rows=$( [[ -f results.tsv ]] && wc -l < results.tsv | tr -d ' ' || echo 0 )
echo "done: $(( end_rows - start_rows )) new results rows"
[[ -x .venv/bin/python ]] && .venv/bin/python scripts/plot_progress.py || true
