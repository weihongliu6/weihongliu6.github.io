#!/usr/bin/env python3
"""Generate daily AI brief content and update archive index."""

from __future__ import annotations

import argparse
import html
import re
import subprocess
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
INDEX_PATH = REPO_ROOT / "ai-briefs/index.html"
BRIEFS_DIR = INDEX_PATH.parent
YOUTUBE_SEARCH_QUERY = "artificial intelligence news"
YOUTUBE_FEED_URL = "https://www.youtube.com/feeds/videos.xml?search_query={query}"
DEFAULT_RESULT_LIMIT = 12


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


def fetch_youtube_search_results(
    query: str = YOUTUBE_SEARCH_QUERY,
    limit: int = DEFAULT_RESULT_LIMIT,
) -> list[dict[str, str]]:
    """Fetch YouTube search results from the public feed."""
    encoded_query = urllib.parse.quote_plus(query)
    feed_url = YOUTUBE_FEED_URL.format(query=encoded_query)

    with urllib.request.urlopen(feed_url, timeout=20) as response:
        xml_payload = response.read()

    root = ET.fromstring(xml_payload)
    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "media": "http://search.yahoo.com/mrss/",
        "yt": "http://www.youtube.com/xml/schemas/2015",
    }

    videos: list[dict[str, str]] = []
    for entry in root.findall("atom:entry", ns):
        title = (entry.findtext("atom:title", default="", namespaces=ns) or "").strip()
        link = ""
        link_elem = entry.find("atom:link", ns)
        if link_elem is not None:
            link = (link_elem.get("href") or "").strip()
        video_id = (entry.findtext("yt:videoId", default="", namespaces=ns) or "").strip()

        thumbnail = ""
        thumb_elem = entry.find("media:group/media:thumbnail", ns)
        if thumb_elem is not None:
            thumbnail = (thumb_elem.get("url") or "").strip()

        if not thumbnail and video_id:
            thumbnail = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

        if title and link:
            videos.append({"title": title, "link": link, "thumbnail": thumbnail})
        if len(videos) >= limit:
            break

    return videos


def extract_videos_from_existing_briefs(
    briefs_dir: Path,
    limit: int = DEFAULT_RESULT_LIMIT,
) -> list[dict[str, str]]:
    """Extract title/link pairs from existing generated brief pages."""
    date_pattern = re.compile(r"^AI_Brief_(\d{4}-\d{2}-\d{2})\.html$")
    candidates = []
    for path in briefs_dir.glob("AI_Brief_*.html"):
        if date_pattern.match(path.name):
            candidates.append(path)
    candidates.sort(key=lambda p: p.name, reverse=True)

    placeholder_markers = ("TEST PAGE", "这里是自动内容测试", "This is a test page")
    videos: list[dict[str, str]] = []
    seen_links: set[str] = set()

    for brief_path in candidates:
        page = brief_path.read_text(encoding="utf-8")
        if any(marker in page for marker in placeholder_markers):
            continue

        matches = re.findall(
            r"<b>(.*?)</b>.*?<a href=['\"](https://www\.youtube\.com/watch\?v=[^'\"]+)['\"]",
            page,
            flags=re.DOTALL,
        )
        for raw_title, raw_link in matches:
            title = html.unescape(re.sub(r"\s+", " ", raw_title).strip())
            title = re.sub(r"^\d+\.\s+", "", title)
            link = raw_link.strip()
            if not title or not link or link in seen_links:
                continue
            seen_links.add(link)
            video_id_match = re.search(r"v=([^&]+)", link)
            thumbnail = (
                f"https://i.ytimg.com/vi/{video_id_match.group(1)}/hqdefault.jpg"
                if video_id_match
                else ""
            )
            videos.append({"title": title, "link": link, "thumbnail": thumbnail})
            if len(videos) >= limit:
                return videos

    return videos


def render_top_videos_html(videos: list[dict[str, str]]) -> str:
    if not videos:
        return (
            '<section class="top-videos">\n'
            "  <h2>Top Videos / 热门视频</h2>\n"
            "  <p>No videos available for this search window.</p>\n"
            "</section>"
        )

    lines = [
        '<section class="top-videos">',
        "  <h2>Top Videos / 热门视频</h2>",
        "  <ol>",
    ]
    for video in videos:
        title = html.escape(video["title"])
        link = html.escape(video["link"], quote=True)
        lines.append("    <li>")
        if video.get("thumbnail"):
            thumbnail = html.escape(video["thumbnail"], quote=True)
            lines.append(
                f'      <a href="{link}" target="_blank" rel="noopener noreferrer">'
                f'<img src="{thumbnail}" alt="{title} thumbnail" loading="lazy" '
                'style="max-width:320px;width:100%;height:auto;display:block;margin:0 0 8px 0;"></a>'
            )
        lines.append(f'      <a href="{link}" target="_blank" rel="noopener noreferrer">{title}</a>')
        lines.append("    </li>")
    lines.extend(["  </ol>", "</section>"])
    return "\n".join(lines)


def render_daily_brief_html(date_str: str, videos: list[dict[str, str]]) -> str:
    top_videos_html = render_top_videos_html(videos)
    return (
        "<!doctype html>\n"
        '<html lang="zh-CN">\n'
        "<head>\n"
        '<meta charset="utf-8">\n'
        "<title>AI Brief</title>\n"
        "<style>\n"
        "body{\n"
        "font-family: Georgia, serif;\n"
        "max-width:900px;\n"
        "margin:40px auto;\n"
        "line-height:1.7;\n"
        "padding:0 20px;\n"
        "background:#fdfdfc;\n"
        "color:#222;\n"
        "}\n"
        "h1{font-size:2em}\n"
        "ol{padding-left:22px;}\n"
        "li{margin-bottom:16px;}\n"
        "</style>\n"
        "</head>\n"
        "<body>\n\n"
        '<p><a href="index.html">← Back to Archive</a></p>\n'
        "<h1>AI Daily Intelligence Brief / AI每日智能简报</h1>\n"
        f"<p>{date_str}</p>\n"
        f"{top_videos_html}\n"
        "</body>\n"
        "</html>\n"
    )


def should_regenerate_existing_brief(html_content: str) -> bool:
    placeholders = (
        "TEST PAGE",
        "这里是自动内容测试",
        "This is a test page",
    )
    return any(marker in html_content for marker in placeholders)


def ensure_daily_brief(date_str: str, briefs_dir: Path = BRIEFS_DIR) -> None:
    target_path = briefs_dir / f"AI_Brief_{date_str}.html"
    print(f"[ensure_daily_brief] target_date={date_str}")
    print(f"[ensure_daily_brief] target_path={target_path}")
    target_exists = target_path.exists()
    print(f"[ensure_daily_brief] target_exists={target_exists}")

    if target_exists:
        current_html = target_path.read_text(encoding="utf-8")
        if not should_regenerate_existing_brief(current_html):
            print("[ensure_daily_brief] File already exists with non-placeholder content; skipping creation.")
            return
        print("[ensure_daily_brief] Placeholder content detected; regenerating file.")

    try:
        videos = fetch_youtube_search_results()
    except Exception as exc:  # noqa: BLE001
        print(f"[ensure_daily_brief] feed_fetch_failed={exc!r}; falling back to existing brief extraction")
        videos = extract_videos_from_existing_briefs(briefs_dir)

    html_content = render_daily_brief_html(date_str, videos)
    target_path.write_text(html_content, encoding="utf-8")
    if not target_path.exists():
        raise RuntimeError(f"Failed to write daily brief file: {target_path}")
    print(f"[ensure_daily_brief] wrote_file={target_path}")


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
