// Snapshot the real research run (../results.tsv, ../memory/insights.md, ../best.json)
// into src/data/run.json so the UI can replay it. Run before `vite build`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const out = join(here, "..", "src", "data", "run.json");

const num = (v) => (v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const read = (p) => (existsSync(join(repo, p)) ? readFileSync(join(repo, p), "utf8") : "");

const lines = read("results.tsv").trim().split("\n").filter(Boolean);
const head = (lines.shift() || "").split("\t");
const rows = lines.map((l) => {
  const c = Object.fromEntries(l.split("\t").map((v, i) => [head[i], v]));
  return {
    turn: num(c.turn), time: c.time, hypothesis: c.hypothesis, status: c.status, verdict: c.verdict,
    mean_cost: num(c.mean_cost), best_before: num(c.best_before),
    folds: ["f1", "f2", "f3", "f4", "f5"].map((k) => num(c[k])),
    wins: num(c.wins), fails: num(c.fails), waste: num(c.waste), rmse125: num(c.rmse125),
    nasa100: num(c.nasa100), T: num(c.T), secs: num(c.secs),
  };
});

const insights = read("memory/insights.md").split("\n").filter((l) => /^\s*-\s*T?\d{4}/.test(l)).map((l) => l.replace(/^\s*-\s*/, ""));
let best = null;
try {
  const b = JSON.parse(read("best.json"));
  best = { turn: b.turn, hypothesis: b.hypothesis, mean_cost: b.mean_cost, T: b.T, fold_costs: b.fold_costs };
} catch {}

writeFileSync(out, JSON.stringify({ exportedAt: new Date().toISOString(), rows, insights, best }, null, 1));
console.log(`run.json: ${rows.length} turns, ${insights.length} insights, best ${best?.mean_cost ?? "-"}`);
