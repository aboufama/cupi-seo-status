#!/usr/bin/env bash
# Refresh docs/status.json from live curls + gh api (no clones).
# Optional: SCREENSHOT=1 ./update.sh  also recaptures docs/shots/*.png
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS="$ROOT/docs"
SHOTS="$DOCS/shots"
mkdir -p "$SHOTS"

python3 - "$DOCS" << 'PY'
import json, os, re, subprocess, sys, urllib.request, ssl
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

DOCS = sys.argv[1]
ET = ZoneInfo("America/New_York")
UA = "CUPI-SEO-Status/1.0 (+https://aboufama.github.io/cupi-seo-status/)"
CTX = ssl.create_default_context()

CAMPAIGNS = [
    {
        "id": "website",
        "name": "Website",
        "live_url": "https://cornellphysicalintelligence.com",
        "repo": "Cornell-Physical-Intelligence/General-Website",
        "repo_url": "https://github.com/Cornell-Physical-Intelligence/General-Website",
        "screenshot": "shots/website.png",
    },
    {
        "id": "wiki",
        "name": "Wiki",
        "live_url": "https://wiki.cornellphysicalintelligence.com",
        "repo": "Cornell-Physical-Intelligence/wiki",
        "repo_url": "https://github.com/Cornell-Physical-Intelligence/wiki",
        "screenshot": "shots/wiki.png",
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
    if sec < 0:
        return "just now"
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
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=25, context=CTX) as resp:
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


def status_sentence(name, live, commits_list, pulls_list, now):
    if not live.get("ok"):
        code = live.get("http_status") or "err"
        err = live.get("error")
        extra = f" ({err})" if err else ""
        return f"{name} is not answering cleanly (HTTP {code}){extra}. Campaign check failed — investigate live URL."
    if not commits_list:
        return f"{name} is live (HTTP {live.get('http_status')}). No recent commits visible via API."
    latest = commits_list[0]
    when = latest.get("date")
    rel = ""
    if when:
        try:
            dt = datetime.fromisoformat(when.replace("Z", "+00:00"))
            rel = f" {relative(dt, now)}"
        except Exception:
            rel = ""
    msg = latest.get("message") or "unspecified change"
    npr = len(pulls_list or [])
    pr = "No open PRs." if npr == 0 else (f"{npr} open PR." if npr == 1 else f"{npr} open PRs.")
    return f"{name} is live (HTTP {live.get('http_status')}). Latest ship{rel}: {msg}. {pr}"


now = datetime.now(timezone.utc)
campaigns = {}
for spec in CAMPAIGNS:
    live = curl_live(spec["live_url"])
    comm, cerr = commits(spec["repo"])
    prs, perr = pulls(spec["repo"])
    shot_path = os.path.join(DOCS, spec["screenshot"])
    shot_ok = os.path.isfile(shot_path) and os.path.getsize(shot_path) > 2000
    campaigns[spec["id"]] = {
        **spec,
        **live,
        "commits": comm,
        "pulls": prs,
        "commits_error": cerr,
        "pulls_error": perr,
        "screenshot_ok": shot_ok,
        "status_sentence": status_sentence(spec["name"], live, comm, prs, now),
        "last_commit_et": et_fmt(datetime.fromisoformat(comm[0]["date"].replace("Z", "+00:00"))) if comm and comm[0].get("date") else None,
    }

payload = {
    "generated_at_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    "generated_at_et": et_fmt(now),
    "timezone": "America/New_York",
    "campaigns": campaigns,
}

out = os.path.join(DOCS, "status.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(f"wrote {out}")
for k, c in campaigns.items():
    print(f"{k}: http={c.get('http_status')} title={c.get('title')!r} shot={c.get('screenshot_ok')} commits={len(c.get('commits') or [])} prs={len(c.get('pulls') or [])}")
PY

if [[ "${SCREENSHOT:-0}" == "1" ]]; then
  CHROME=""
  for c in google-chrome-stable google-chrome chromium chromium-browser; do
    if command -v "$c" >/dev/null 2>&1; then CHROME="$c"; break; fi
  done
  if [[ -n "$CHROME" ]]; then
    "$CHROME" --headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage \
      --hide-scrollbars --window-size=1440,900 \
      --screenshot="$SHOTS/website.png" --virtual-time-budget=12000 --timeout=20000 \
      "https://cornellphysicalintelligence.com" || true
    "$CHROME" --headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage \
      --hide-scrollbars --window-size=1440,900 \
      --screenshot="$SHOTS/wiki.png" --virtual-time-budget=15000 --timeout=25000 \
      "https://wiki.cornellphysicalintelligence.com" || true
    # rewrite json so screenshot_ok reflects new files
    SCREENSHOT=0 "$0"
  else
    echo "no chrome/chromium; skipped screenshots" >&2
  fi
fi
