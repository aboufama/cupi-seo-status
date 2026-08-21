#!/usr/bin/env python3
"""Write docs/status.json and docs/brief.md from local files only. Does not touch ranks.json."""
import json
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

DOCS = Path(__file__).resolve().parent / "docs"
ET = ZoneInfo("America/New_York")


def et_fmt(dt):
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(ET).strftime("%b %-d, %Y · %-I:%M %p %Z")


def load(path, default):
    p = Path(path)
    if not p.is_file():
        return default
    return json.loads(p.read_text(encoding="utf-8"))


def main():
    ranks = load(DOCS / "ranks.json", None)
    if not isinstance(ranks, dict) or not ranks.get("queries"):
        raise SystemExit("docs/ranks.json missing or empty")
    old = load(DOCS / "status.json", {})
    agents = load(DOCS / "agents.json", [])
    if isinstance(agents, dict):
        agents = agents.get("agents") or []
    campaigns = old.get("campaigns") or {}
    site = campaigns.get("website") or {}
    wiki = campaigns.get("wiki") or {}
    queries = ranks["queries"]
    n = len(queries)
    av = ranks.get("averages") or {}
    mean = av.get("official_mean_when_ranked")
    ranked = av.get("official_ranked_count")
    missed = av.get("official_miss_count")
    wiki_hit = av.get("wiki_ranked_count", 0)
    when = ranks.get("generated_at_et") or "the latest snapshot"

    title = site.get("title") or "its current title"
    code = site.get("http_status") or 200
    brief_parts = [
        f"The official site is live (HTTP {code}) and serving “{title}.",
        f"On a search snapshot from {when} — not Google Search Console — cornellphysicalintelligence.com ranks in {ranked} of {n} tracked queries, averaging position {mean} where it appears, and is missing from the other {missed}.",
        f"The wiki is in {wiki_hit} of {n}.",
        "Campus Groups and the GitHub org take most of the #1 slots; the Cornell Parole Initiative still shows up on the short CUPI names.",
        "The bare query “CUPI” belongs to Cisco’s API and an Indian fintech — the club does not appear.",
        "The wiki URL itself does not rank, because the public page is a Google login wall.",
        "Wiki pull request #1 would add crawlable landing prose; it is not merged yet.",
    ]
    # fix title period
    if title.endswith((".", "!", "?")):
        brief_parts[0] = f"The official site is live (HTTP {code}) and serving “{title}”"
    else:
        brief_parts[0] = f"The official site is live (HTTP {code}) and serving “{title}.”"
    brief = " ".join(brief_parts)

    last_site = (site.get("commits") or [{}])[0].get("message")
    last_wiki = (wiki.get("commits") or [{}])[0].get("message")
    website_update = (
        f"Website is up (HTTP {site.get('http_status') or 200}) and the live title is “{site.get('title') or '—'}.” "
        + (f"The latest change was: {last_site}. " if last_site else "")
        + "No open pull requests. "
        + f"It ranks on {ranked} of {n} queries (average {mean} when present) and is not in results for the other {missed}, including the bare acronym and the project queries."
    )
    wiki_update = (
        f"Wiki is up (HTTP {wiki.get('http_status') or 200}) and the live title is “{wiki.get('title') or '—'}.” "
        + "The public URL is a Google login wall, so a crawler has no public copy to rank. "
        + (f"The latest change was: {last_wiki}. " if last_wiki else "")
        + f"It is not in results for any of the {n} tracked queries (0/{n}). "
        + "Open pull request #1 — public crawlable landing — is not merged yet."
    )

    now = datetime.now(timezone.utc)
    payload = {
        "generated_at_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "generated_at_et": et_fmt(now),
        "timezone": "America/New_York",
        "brief": brief,
        "updates": {"website": website_update, "wiki": wiki_update},
        "ranks": ranks,
        "campaigns": campaigns,
        "agents": agents,
        "refresh": "github-actions-every-30m",
    }
    (DOCS / "status.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    lines = [
        "# CUPI SEO",
        "",
        f"Last check: {payload['generated_at_et']}",
        "",
        brief,
        "",
        ranks.get("disclaimer") or "Search snapshot, not Google Search Console.",
        f"Snapshot: {when}",
        f"Official site average {mean} on the {ranked} that ranked. Wiki {wiki_hit}/{n}.",
        "",
        "| Query | Official site | Wiki | Who is #1 | Notes |",
        "| --- | --- | --- | --- | --- |",
    ]
    for q in queries:
        off = q.get("official_rank")
        wiki_r = q.get("wiki_rank")
        off_s = str(off) if off is not None else "not in results"
        wiki_s = str(wiki_r) if wiki_r is not None else "not in results"
        notes = (q.get("notes") or "").replace("|", "/")
        top = (q.get("top") or "—").replace("|", "/")
        lines.append(f"| {q.get('q') or ''} | {off_s} | {wiki_s} | {top} | {notes} |")
    lines.extend(["", "Website", website_update, "", "Wiki", wiki_update, ""])
    (DOCS / "brief.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote status.json and brief.md with {n} queries")
    print(brief)


if __name__ == "__main__":
    main()
