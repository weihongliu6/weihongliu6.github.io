#!/usr/bin/env python3
#!/usr/bin/env python3
"""Update AI brief archive page and optionally publish to GitHub."""

from __future__ import annotations

import argparse
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
INDEX_PATH = REPO_ROOT / "ai-briefs/index.html"
BRIEFS_DIR = INDEX_PATH.parent


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def collect_brief_dates(briefs_dir: Path, include_date: str | None = None) -> list[str]:
    date_pattern = re.compile(r"^AI_Brief_(\d{4}-\d{2}-\d{2})\.html$")
    dates = {
        match.group(1)
        for path in briefs_dir.glob("AI_Brief_*.html")
        if (match := date_pattern.match(path.name))
    }
    if include_date:
        dates.add(include_date)
    return sorted(dates, reverse=True)


def ensure_daily_brief(date_str: str, briefs_dir: Path = BRIEFS_DIR) -> None:
    target_path = briefs_dir / f"AI_Brief_{date_str}.html"
    if target_path.exists():
        return

    candidates = sorted(briefs_dir.glob("AI_Brief_*.html"), key=lambda p: p.name, reverse=True)
    if not candidates:
        raise FileNotFoundError("No existing AI brief file found to use as a template.")

    source_path = candidates[0]
    html = source_path.read_text(encoding="utf-8")
    html = re.sub(r"\b\d{4}-\d{2}-\d{2}\b", date_str, html, count=1)
    target_path.write_text(html, encoding="utf-8")


def update_archive_index(date_str: str, index_path: Path = INDEX_PATH) -> None:
    html = index_path.read_text(encoding="utf-8")
    brief_dates = collect_brief_dates(index_path.parent, include_date=date_str)
    if not brief_dates:
        brief_dates = [date_str]

    latest_href = f"AI_Brief_{brief_dates[0]}.html"
    archive_lines = "\n".join(f'<a href="AI_Brief_{d}.html">{d} Brief</a>' for d in brief_dates)

    html = re.sub(
        r'(<a href=")AI_Brief_[0-9]{4}-[0-9]{2}-[0-9]{2}\.html("\>Open Latest Brief</a>)',
        rf"\1{latest_href}\2",
        html,
        count=1,
    )

    html = re.sub(
        r"(<!-- BRIEF_ARCHIVE_START -->)(.*?)(<!-- BRIEF_ARCHIVE_END -->)",
        rf"\1\n{archive_lines}\n\3",
        html,
        count=1,
        flags=re.DOTALL,
    )

    index_path.write_text(html, encoding="utf-8")


def publish_changes(date_str: str) -> None:
    run(["git", "add", str(INDEX_PATH), f"ai-briefs/AI_Brief_{date_str}.html"])
    run(["git", "commit", "-m", f"Publish AI brief {date_str}"])
    run(["git", "pull", "--rebase", "origin", "main"])
    run(["git", "push", "origin", "main"])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Update AI brief archive and publish.")
    parser.add_argument(
        "date",
        nargs="?",
        default=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        help="Brief date in YYYY-MM-DD format (defaults to current UTC date)",
    )
    parser.add_argument(
        "--ensure-daily",
        action="store_true",
        help="Create ai-briefs/AI_Brief_YYYY-MM-DD.html if missing by copying the latest existing brief.",
    )
    parser.add_argument("--publish", action="store_true", help="Run git add/commit/pull --rebase/push")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.ensure_daily:
        ensure_daily_brief(args.date)
    update_archive_index(args.date)
    if args.publish:
        publish_changes(args.date)


if __name__ == "__main__":
    main()
