"""Copy results from out/ into docs/ for the GitHub Pages site, and set the repo link.

Usage: python publish_site.py
Copies out/*.png, headline.json, kept_changes.md and the two preds CSVs into docs/figures/,
and out/deck.pdf to docs/deck.pdf if it exists. Anything missing stays a placeholder on the page.
"""
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
OUT, DOCS = ROOT / "out", ROOT / "docs"
FIGURES = DOCS / "figures"
FILES = ["headline.json", "kept_changes.md", "preds_baseline.csv", "preds_best.csv"]


def repo_url():
    try:
        url = subprocess.run(["git", "remote", "get-url", "origin"], cwd=ROOT,
                             capture_output=True, text=True, check=True).stdout.strip()
    except subprocess.CalledProcessError:
        return None
    url = re.sub(r"^git@github\.com:", "https://github.com/", url)
    return re.sub(r"\.git$", "", url)


def main():
    FIGURES.mkdir(parents=True, exist_ok=True)
    copied = []
    for src in sorted(OUT.glob("*.png")) + [OUT / f for f in FILES]:
        if src.exists():
            shutil.copy2(src, FIGURES / src.name)
            copied.append(src.name)
    if (OUT / "deck.pdf").exists():
        shutil.copy2(OUT / "deck.pdf", DOCS / "deck.pdf")
        copied.append("deck.pdf")

    url = repo_url()
    if url:
        page = DOCS / "index.html"
        html = re.sub(r'(<a id="repo-link" href=")[^"]*(")', rf"\g<1>{url}\g<2>", page.read_text())
        page.write_text(html)
    print(f"copied {len(copied)} files: {', '.join(copied) or 'none'}; repo link: {url or 'unchanged'}")


if __name__ == "__main__":
    main()
