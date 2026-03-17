#!/usr/bin/env python3
"""Update AI brief archive page and optionally publish to GitHub."""

from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path

INDEX_PATH = Path("ai-briefs/index.html")


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def update_archive_index(date_str: str, index_path: Path = INDEX_PATH) -> None:
    html = index_path.read_text(encoding="utf-8")

    latest_href = f'AI_Brief_{date_str}.html'
    html = re.sub(
        r'(<a href=")AI_Brief_[0-9]{4}-[0-9]{2}-[0-9]{2}\.html("\>Open Latest Brief</a>)',
        rf"\1{latest_href}\2",
        html,
        count=1,
    )

    new_archive_line = f'<a href="{latest_href}">{date_str} Brief</a>'
    if new_archive_line not in html:
        html = re.sub(
            r'(<span class="subtitle">Brief Archive</span>\s*</h2>\s*)',
            rf"\1\n{new_archive_line}\n",
            html,
            count=1,
        )

    index_path.write_text(html, encoding="utf-8")


def publish_changes(date_str: str) -> None:
    run(["git", "add", str(INDEX_PATH), f"ai-briefs/AI_Brief_{date_str}.html"])
    run(["git", "commit", "-m", f"Publish AI brief {date_str}"])
    run(["git", "pull", "--rebase", "origin", "main"])
    run(["git", "push", "origin", "main"])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Update AI brief archive and publish.")
    parser.add_argument("date", help="Brief date in YYYY-MM-DD format")
    parser.add_argument("--publish", action="store_true", help="Run git add/commit/pull --rebase/push")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    update_archive_index(args.date)
    if args.publish:
        publish_changes(args.date)


if __name__ == "__main__":
    main()
