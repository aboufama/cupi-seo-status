# CUPI SEO status

Public mission-control board for two parallel SEO campaigns:

- Website — https://cornellphysicalintelligence.com (`Cornell-Physical-Intelligence/General-Website`)
- Wiki — https://wiki.cornellphysicalintelligence.com (`Cornell-Physical-Intelligence/wiki`)

Live Pages: see `LIVE_URL.txt` after first publish.

## Refresh

```bash
./update.sh              # curls titles + gh api commits/PRs → docs/status.json
SCREENSHOT=1 ./update.sh # also recaptures docs/shots/*.png
```

Does not clone the CUPI repos. GitHub Pages serves `docs/` from `main`.
