# CUPI SEO

Live: https://aboufama.github.io/cupi-seo-status/

A short public note for two properties:

- Website — https://cornellphysicalintelligence.com
- Wiki — https://wiki.cornellphysicalintelligence.com

Ranks come from `docs/ranks.json` (a search-index snapshot, not Google Search Console).
`update.sh` curls live titles, reads commits and open PRs with `gh api` (no clones),
and rewrites `docs/brief.md` plus `docs/status.json` in prose.

GitHub Actions runs `.github/workflows/refresh.yml` every 30 minutes
(also `workflow_dispatch` / `repository_dispatch` type `seo-status-refresh`).
