# CUPI SEO

Live: https://aboufama.github.io/cupi-seo-status/

A short public note for two properties:

- Website — https://cornellphysicalintelligence.com
- Wiki — https://wiki.cornellphysicalintelligence.com

Ranks come from `docs/ranks.json` (a search-index snapshot, not Google Search Console).
Day-level history is `docs/history.json` (America/New_York calendar dates; same-day refresh overwrites).
`update.sh` curls live titles, reads commits and open PRs with `gh api` (no clones),
and rewrites `docs/brief.md`, `docs/status.json`, and today's history point.

GitHub Actions runs `.github/workflows/refresh.yml` every 30 minutes
(also `workflow_dispatch` / `repository_dispatch` type `seo-status-refresh`).

Ox Alpha token use is `docs/tokens.json`, summed from the box burn log.
The board polls it every minute. GitHub Actions also watches it on a 5-minute cron
and still refreshes the rest of the board every 30 minutes.

