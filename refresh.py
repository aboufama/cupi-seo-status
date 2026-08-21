import json, os, re, subprocess, sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

DOCS = sys.argv[1]
ET = ZoneInfo("America/New_York")
UA = "CUPI-SEO-Status/1.0 (+https://aboufama.github.io/cupi-seo-status/)"

CAMPAIGNS = [
    {
        "id": "website",
        "name": "Website",
        "live_url": "https://cornellphysicalintelligence.com",
        "repo": "Cornell-Physical-Intelligence/General-Website",
        "repo_url": "https://github.com/Cornell-Physical-Intelligence/General-Website",
        "screenshot": "shots/website.png",
        "host": "cornellphysicalintelligence.com",
    },
    {
        "id": "wiki",
        "name": "Wiki",
        "live_url": "https://wiki.cornellphysicalintelligence.com",
        "repo": "Cornell-Physical-Intelligence/wiki",
        "repo_url": "https://github.com/Cornell-Physical-Intelligence/wiki",
        "screenshot": "shots/wiki.png",
        "host": "wiki.cornellphysicalintelligence.com",
    },
]


def et_fmt(dt):
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    local = dt.astimezone(ET)
    return local.strftime("%b %-d, %Y · %-I:%M %p %Z")


def relative(dt, now):
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    sec = int((now - dt.astimezone(timezone.utc)).total_seconds())
    if sec < 90:
        return "just now"
    if sec < 3600:
        return f"{sec // 60}m ago"
    if sec < 86400:
        h = sec // 3600
        return f"{h}h ago"
    d = sec // 86400
    return f"{d}d ago"


def first_line(msg):
    return (msg or "").splitlines()[0].strip()


def curl_live(url):
    import ssl, urllib.request
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=25, context=ctx) as resp:
            body = resp.read()
            headers = {k.lower(): v for k, v in resp.headers.items()}
            html = body.decode("utf-8", errors="replace")
            m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
            title = re.sub(r"\s+", " ", m.group(1)).strip() if m else None
            return {
                "http_status": resp.status,
                "title": title,
                "last_modified": headers.get("last-modified"),
                "bytes": len(body),
                "ok": 200 <= resp.status < 400,
            }
    except Exception as e:
        return {
            "http_status": None,
            "title": None,
            "last_modified": None,
            "bytes": 0,
            "ok": False,
            "error": str(e),
        }


def gh_json(path):
    r = subprocess.run(
        ["gh", "api", path],
        capture_output=True,
        text=True,
        check=False,
    )
    if r.returncode != 0:
        return None, (r.stderr or r.stdout or "gh api failed").strip()
    if not r.stdout.strip():
        return [], None
    return json.loads(r.stdout), None


def commits(repo):
    data, err = gh_json(f"repos/{repo}/commits?per_page=6")
    if err or not isinstance(data, list):
        return [], err
    out = []
    for c in data:
        commit = c.get("commit") or {}
        author = commit.get("author") or {}
        msg = commit.get("message") or ""
        out.append({
            "sha": (c.get("sha") or "")[:7],
            "url": c.get("html_url"),
            "message": first_line(msg),
            "author": author.get("name"),
            "date": author.get("date"),
        })
    return out, None


def pulls(repo):
    data, err = gh_json(f"repos/{repo}/pulls?state=open&per_page=10")
    if err or not isinstance(data, list):
        return [], err
    return [
        {
            "number": p.get("number"),
            "title": p.get("title"),
            "url": p.get("html_url"),
            "user": (p.get("user") or {}).get("login"),
            "created_at": p.get("created_at"),
        }
        for p in data
    ], None


def load_json(path, default):
    if not os.path.isfile(path):
        return default
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def looks_like_login_wall(title, url=None):
    t = (title or "").lower()
    needles = ("sign in", "sign-in", "google accounts", "accounts.google", "login", "log in")
    return any(n in t for n in needles)


def join_and(items):
    items = [i for i in items if i]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return ", ".join(items[:-1]) + ", and " + items[-1]


def pos_label(pos):
    if pos is None:
        return "not in top results"
    return f"position {pos}"


def q_text(q):
    return q.get("q") or q.get("query") or ""


def official_rank(q):
    if "official_rank" in q:
        return q.get("official_rank")
    return q.get("website_position")


def wiki_rank(q):
    if "wiki_rank" in q:
        return q.get("wiki_rank")
    return q.get("wiki_position")


def top_of(q):
    if q.get("top"):
        return q["top"]
    for r in q.get("results") or []:
        if r.get("position") == 1:
            return r.get("name")
    return None


def official_average(queries):
    nums = [official_rank(q) for q in queries]
    nums = [n for n in nums if isinstance(n, (int, float))]
    if not nums:
        return None
    return round(sum(nums) / len(nums), 1)


def normalize_ranks(ranks):
    """Keep the snapshot as-is. Never drop query rows."""
    if not isinstance(ranks, dict):
        return None
    out = dict(ranks)
    queries = list(out.get("queries") or [])
    out["queries"] = queries
    av = out.get("averages") or {}
    if out.get("official_average") is None:
        if av.get("official_mean_when_ranked") is not None:
            out["official_average"] = av["official_mean_when_ranked"]
        else:
            out["official_average"] = official_average(queries)
    return out


def generate_brief(campaigns, ranks, now):
    site = campaigns["website"]
    wiki = campaigns["wiki"]
    sentences = []

    if site.get("ok"):
        title = site.get("title") or "its current title"
        sentences.append(
            f"The official site is live (HTTP {site.get('http_status')}) and serving “{title}.”"
        )
    else:
        code = site.get("http_status") or "error"
        extra = f" {site.get('error')}" if site.get("error") else ""
        sentences.append(f"The official site did not answer cleanly (HTTP {code}).{extra}")

    if ranks and ranks.get("queries"):
        n = len(ranks["queries"])
        av = ranks.get("averages") or {}
        avg = av.get("official_mean_when_ranked") or ranks.get("official_average") or official_average(ranks["queries"])
        ranked = av.get("official_ranked_count")
        missed = av.get("official_miss_count")
        if ranked is None:
            ranked = sum(1 for q in ranks["queries"] if official_rank(q) is not None)
            missed = n - ranked
        as_of = ranks.get("generated_at_et") or ranks.get("as_of_et") or "the latest snapshot"
        if avg is not None:
            sentences.append(
                f"On a search snapshot from {as_of} — not Google Search Console — "
                f"cornellphysicalintelligence.com ranks in {ranked} of {n} tracked queries, "
                f"averaging position {avg} where it appears, and is missing from the other {missed}."
            )
        else:
            sentences.append(
                f"A search snapshot from {as_of} is on file — this is not Google Search Console. "
                f"{n} queries are listed; ranks are only shown when the property appeared."
            )

        # Short-name problem from row notes / tops, without dumping the table
        notes = ranks.get("notes") or {}
        if notes.get("problem"):
            sentences.append(notes["problem"])
        else:
            short_tops = []
            for q in ranks["queries"]:
                name = q_text(q)
                if name in ("Cornell CUPI", "CUPI Cornell") and top_of(q):
                    short_tops.append(top_of(q))
            seen = set()
            uniq = []
            for t in short_tops:
                k = t.lower()
                if k not in seen:
                    seen.add(k)
                    uniq.append(t)
            if uniq:
                sentences.append(
                    f"The short queries are the problem: {join_and(uniq)} take the #1 slot on the names people actually type."
                )

        wiki_any = any(wiki_rank(q) is not None for q in ranks["queries"])
        if not wiki_any:
            if notes.get("wiki"):
                sentences.append("The wiki is not in the top results for any tracked query. " + notes["wiki"])
            elif looks_like_login_wall(wiki.get("title")):
                sentences.append(
                    "The wiki is not in the top results for any tracked query — the public URL still presents a Google login wall, so there is little for a crawler to index."
                )
            else:
                sentences.append(
                    "The wiki is not in the top results for any tracked query. The public page is a Google login wall, so there is nothing for a crawler to index."
                )
    else:
        sentences.append("No search-index snapshot is on file, so ranks are not shown.")

    wiki_prs = wiki.get("pulls") or []
    if wiki_prs:
        pr = wiki_prs[0]
        title = pr.get("title") or "an open change"
        sentences.append(
            f"Wiki pull request #{pr.get('number')} ({title}) is open and not merged yet."
        )
        if re.search(r"crawl|public|landing|prose|seo", title, re.I):
            sentences.append("Until that ships, the wiki stays invisible to search.")
    elif ranks and not any(wiki_rank(q) is not None for q in ranks.get("queries") or []):
        if looks_like_login_wall(wiki.get("title")):
            sentences.append("Nothing is queued that would replace the login wall with public prose.")

    site_prs = site.get("pulls") or []
    if site_prs and len(sentences) < 8:
        n = len(site_prs)
        if n == 1:
            sentences.append(
                f"Website pull request #{site_prs[0].get('number')} ({site_prs[0].get('title')}) is still open."
            )
        else:
            sentences.append(f"The website has {n} open pull requests.")

    # trim to 8
    return " ".join(sentences[:8])


def property_paragraph(c, ranks, now, kind):
    parts = []
    name = c.get("name") or kind
    if c.get("ok"):
        title = c.get("title")
        if title:
            parts.append(f"{name} is up (HTTP {c.get('http_status')}) and the live title is “{title}.")
            # fix extra period if title already ends with punctuation
            if title.endswith((".", "!", "?")):
                parts[-1] = f"{name} is up (HTTP {c.get('http_status')}) and the live title is “{title}”"
            else:
                parts[-1] = f"{name} is up (HTTP {c.get('http_status')}) and the live title is “{title}.”"
        else:
            parts.append(f"{name} is up (HTTP {c.get('http_status')}).")
    else:
        code = c.get("http_status") or "error"
        parts.append(f"{name} did not answer cleanly (HTTP {code}).")

    notes = (ranks or {}).get("notes") or {}
    if kind == "wiki":
        if looks_like_login_wall(c.get("title")):
            parts.append("That page is a sign-in wall, so a crawler has no public copy to rank.")
        elif notes.get("wiki"):
            parts.append(notes["wiki"])

    comm = (c.get("commits") or [None])[0]
    if comm and comm.get("message"):
        rel = ""
        if comm.get("date"):
            try:
                dt = datetime.fromisoformat(comm["date"].replace("Z", "+00:00"))
                rel = f" {relative(dt, now)}"
            except Exception:
                rel = ""
        parts.append(f"The latest change{rel} was: {comm['message']}.")

    prs = c.get("pulls") or []
    if not prs:
        parts.append("No open pull requests.")
    elif len(prs) == 1:
        p = prs[0]
        parts.append(f"Open pull request #{p.get('number')} — {p.get('title')}.")
    else:
        listed = "; ".join(f"#{p.get('number')} — {p.get('title')}" for p in prs[:4])
        parts.append(f"Open pull requests: {listed}.")

    if ranks and ranks.get("queries"):
        if kind == "website":
            avg = ranks.get("official_average") or official_average(ranks["queries"])
            missing = [q_text(q) for q in ranks["queries"] if official_rank(q) is None]
            if avg is not None and not missing:
                parts.append(
                    f"Average position among tracked queries is {avg}; it does not own the short-name slots."
                )
            elif missing:
                miss = join_and([f"“{m}”" for m in missing])
                parts.append(f"It is not in the top results for {miss}.")
        else:
            missing = [q_text(q) for q in ranks["queries"] if wiki_rank(q) is None]
            if missing and len(missing) == len(ranks["queries"]):
                parts.append("It is not in the top results for any tracked query.")
            elif missing:
                parts.append(f"It is not in the top results for {join_and(['“'+m+'”' for m in missing])}.")

    return " ".join(parts)


def write_brief_md(path, generated_at_et, brief, updates, ranks):
    lines = [
        "# CUPI SEO",
        "",
        f"Last check: {generated_at_et}",
        "",
        brief,
        "",
    ]
    if ranks:
        lines.append("Search snapshot, not Google Search Console.")
        when = ranks.get("generated_at_et") or ranks.get("as_of_et")
        if when:
            lines.append(f"Snapshot: {when}")
        avg = ranks.get("official_average") or official_average(ranks.get("queries") or [])
        if avg is not None:
            lines.append(f"Average position for cornellphysicalintelligence.com: {avg}")
        lines.append("")
        lines.append("| Query | Official site | Wiki | Who is #1 | Notes |")
        lines.append("| --- | --- | --- | --- | --- |")
        for q in ranks.get("queries") or []:
            off = official_rank(q)
            wiki = wiki_rank(q)
            off_s = str(off) if off is not None else "not in top results"
            wiki_s = str(wiki) if wiki is not None else "not in top results"
            notes = (q.get("notes") or "").replace("|", "/")
            top = (top_of(q) or "—").replace("|", "/")
            lines.append(f"| {q_text(q)} | {off_s} | {wiki_s} | {top} | {notes} |")
        lines.append("")
    lines.append("Website")
    lines.append(updates.get("website") or "")
    lines.append("")
    lines.append("Wiki")
    lines.append(updates.get("wiki") or "")
    lines.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def main():
    now = datetime.now(timezone.utc)
    campaigns = {}
    for spec in CAMPAIGNS:
        live = curl_live(spec["live_url"])
        comm, cerr = commits(spec["repo"])
        prs, perr = pulls(spec["repo"])
        shot_path = os.path.join(DOCS, spec["screenshot"])
        shot_ok = os.path.isfile(shot_path) and os.path.getsize(shot_path) > 2000
        last_et = None
        if comm and comm[0].get("date"):
            last_et = et_fmt(datetime.fromisoformat(comm[0]["date"].replace("Z", "+00:00")))
        campaigns[spec["id"]] = {
            **spec,
            **live,
            "commits": comm,
            "pulls": prs,
            "commits_error": cerr,
            "pulls_error": perr,
            "screenshot_ok": shot_ok,
            "last_commit_et": last_et,
        }
    
    agents_raw = load_json(os.path.join(DOCS, "agents.json"), [])
    if isinstance(agents_raw, list):
        agents = agents_raw
    elif isinstance(agents_raw, dict) and isinstance(agents_raw.get("agents"), list):
        agents = agents_raw["agents"]
    else:
        agents = []
    
    ranks = normalize_ranks(load_json(os.path.join(DOCS, "ranks.json"), None))
    
    brief = generate_brief(campaigns, ranks, now)
    updates = {
        "website": property_paragraph(campaigns["website"], ranks, now, "website"),
        "wiki": property_paragraph(campaigns["wiki"], ranks, now, "wiki"),
    }
    
    payload = {
        "generated_at_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "generated_at_et": et_fmt(now),
        "timezone": "America/New_York",
        "brief": brief,
        "updates": updates,
        "ranks": ranks,
        "campaigns": campaigns,
        "agents": agents,
        "refresh": "github-actions-every-30m",
    }
    
    out = os.path.join(DOCS, "status.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")
    write_brief_md(os.path.join(DOCS, "brief.md"), payload["generated_at_et"], brief, updates, ranks)
    print(f"wrote {out}")
    print(brief)
    print("---")
    for k, c in campaigns.items():
        print(f"{k}: http={c.get('http_status')} title={c.get('title')!r} prs={len(c.get('pulls') or [])}")
    

if __name__ == '__main__':
    main()
