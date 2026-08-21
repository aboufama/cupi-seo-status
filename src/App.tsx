import { useEffect, useMemo, useState, type MouseEvent } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

type RankQuery = {
  q?: string
  query?: string
  official_rank?: number | null
  wiki_rank?: number | null
  website_position?: number | null
  wiki_position?: number | null
  top?: string | null
  notes?: string
}

type Ranks = {
  generated_at?: string
  generated_at_et?: string
  as_of_et?: string
  source?: string
  source_note?: string
  disclaimer?: string
  official_average?: number | null
  website_average?: number | null
  averages?: {
    official_mean_when_ranked?: number
    official_ranked_count?: number
    official_miss_count?: number
    wiki_ranked_count?: number
    wiki_miss_count?: number
  }
  queries?: RankQuery[]
}

type Campaign = {
  id: string
  name: string
  live_url: string
  screenshot?: string
  screenshot_ok?: boolean
  http_status?: number | null
  ok?: boolean
}

type HistoryDay = {
  date: string
  at1: number
  official_on_index: number
  wiki_on_index?: number
  official_avg?: number | null
  n_queries: number
  source?: string
}

type History = {
  timezone?: string
  days: HistoryDay[]
}

type Status = {
  generated_at_et?: string
  brief?: string
  updates?: { website?: string; wiki?: string }
  ranks?: Ranks | null
  history?: History
  campaigns?: { website?: Campaign; wiki?: Campaign }
}

const STAIR_STEPS = [5, 4, 3, 2, 1] as const
const STAIR_H: Record<(typeof STAIR_STEPS)[number], string> = {
  5: "h-1.5",
  4: "h-2",
  3: "h-2.5",
  2: "h-3",
  1: "h-3.5",
}

function statusUrl() {
  return `${import.meta.env.BASE_URL}status.json`
}

function historyUrl() {
  return `${import.meta.env.BASE_URL}history.json`
}

function shotUrl(src: string) {
  return `${import.meta.env.BASE_URL}${src.replace(/^\//, "")}`
}

function qText(row: RankQuery) {
  return row.q || row.query || ""
}

function officialRank(row: RankQuery) {
  return row.official_rank ?? row.website_position ?? null
}

function wikiRank(row: RankQuery) {
  return row.wiki_rank ?? row.wiki_position ?? null
}

function rankCell(pos: number | null | undefined) {
  if (pos == null) {
    return <span className="text-muted-foreground">not in results</span>
  }
  return <span className="tabular-nums">{pos}</span>
}

function average(rows: RankQuery[]) {
  const nums = rows
    .map(officialRank)
    .filter((n): n is number => typeof n === "number")
  if (!nums.length) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

function stairKey(row: RankQuery) {
  const r = officialRank(row)
  return r == null ? Number.POSITIVE_INFINITY : r
}

function stairSorted(rows: RankQuery[]) {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const da = stairKey(a.row)
      const db = stairKey(b.row)
      if (da !== db) return da - db
      return a.i - b.i
    })
    .map(({ row }) => row)
}

function pct(part: number, total: number) {
  if (!total) return 0
  return (part / total) * 100
}

function Stair({ rank }: { rank: number | null }) {
  return (
    <span className="mt-1.5 flex items-end gap-px" aria-hidden>
      {STAIR_STEPS.map((step) => (
        <span
          key={step}
          className={cn(
            "w-1.5 rounded-[1px]",
            STAIR_H[step],
            rank === step ? "bg-primary" : "bg-muted-foreground/20"
          )}
        />
      ))}
    </span>
  )
}

function PropertyCard({
  title,
  body,
  campaign,
}: {
  title: string
  body?: string
  campaign?: Campaign
}) {
  const live = campaign?.ok
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        <CardAction>
          <Badge variant={live ? "default" : "secondary"}>
            <span
              className={
                live
                  ? "size-1.5 rounded-full bg-primary-foreground"
                  : "size-1.5 rounded-full bg-muted-foreground"
              }
            />
            {live ? campaign?.http_status ?? "live" : "down"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {campaign?.live_url ? (
          <p className="text-sm">
            <a href={campaign.live_url}>
              {campaign.live_url.replace(/^https?:\/\//, "")}
            </a>
          </p>
        ) : null}
        <p className="text-[15px] leading-relaxed text-foreground/90">{body}</p>
        {campaign?.screenshot_ok && campaign.screenshot ? (
          <a href={campaign.live_url} className="block">
            <img
              src={shotUrl(campaign.screenshot)}
              alt=""
              className="mt-1 max-h-28 w-full rounded-md border object-cover object-top"
            />
          </a>
        ) : null}
      </CardContent>
    </Card>
  )
}

function parseYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1))
}

function ymdOf(dt: Date) {
  return dt.toISOString().slice(0, 10)
}

function addDays(ymd: string, n: number) {
  const dt = parseYmd(ymd)
  dt.setUTCDate(dt.getUTCDate() + n)
  return ymdOf(dt)
}

function isoWeekStart(ymd: string) {
  const dt = parseYmd(ymd)
  const dow = dt.getUTCDay() || 7
  dt.setUTCDate(dt.getUTCDate() - (dow - 1))
  return ymdOf(dt)
}

function shortDate(ymd: string) {
  return parseYmd(ymd).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function dayTickLabel(ymd: string, i: number, ticks: string[]) {
  const dt = parseYmd(ymd)
  if (i === 0) return shortDate(ymd)
  const prev = parseYmd(ticks[i - 1])
  if (prev.getUTCMonth() !== dt.getUTCMonth()) return shortDate(ymd)
  return String(dt.getUTCDate())
}

function realDays(history: History) {
  return [...(history.days || [])]
    .filter((d) => d && typeof d.date === "string")
    .sort((a, b) => a.date.localeCompare(b.date))
}

function dayAxis(days: HistoryDay[]) {
  if (!days.length) return []
  const first = days[0].date
  const last = days[days.length - 1].date
  const weekEnd = addDays(isoWeekStart(last), 6)
  let end = last > weekEnd ? last : weekEnd
  const span = Math.round(
    (parseYmd(end).getTime() - parseYmd(first).getTime()) / 86400000
  )
  if (span < 6) end = addDays(first, 6)
  const ticks: string[] = []
  for (let d = first; d <= end; d = addDays(d, 1)) ticks.push(d)
  return ticks
}

function weekBuckets(days: HistoryDay[]) {
  const lastByWeek = new Map<string, HistoryDay>()
  for (const d of days) lastByWeek.set(isoWeekStart(d.date), d)
  return [...lastByWeek.entries()].map(([start, day]) => ({ start, day }))
}

function weekAxis(buckets: { start: string }[]) {
  if (!buckets.length) return []
  const first = buckets[0].start
  const last = buckets[buckets.length - 1].start
  let end = last
  if (buckets.length < 8) end = addDays(first, 7 * 7)
  if (last > end) end = last
  const ticks: string[] = []
  for (let d = first; d <= end; d = addDays(d, 7)) ticks.push(d)
  return ticks
}

type PlotPoint = {
  key: string
  label: string
  at1: number
  official: number
}

function ClimbCard({ history }: { history: History }) {
  const [mode, setMode] = useState<"days" | "weeks">("days")
  const [hover, setHover] = useState<number | null>(null)

  const days = useMemo(() => realDays(history), [history])
  if (!days.length) return null

  const useWeeks = mode === "weeks" && days.length >= 8
  const buckets = weekBuckets(days)
  const ticks = useWeeks ? weekAxis(buckets) : dayAxis(days)
  const byKey = new Map<string, HistoryDay>()
  if (useWeeks) {
    for (const b of buckets) byKey.set(b.start, b.day)
  } else {
    for (const d of days) byKey.set(d.date, d)
  }

  const points: PlotPoint[] = ticks.flatMap((key) => {
    const d = byKey.get(key)
    if (!d) return []
    return [
      {
        key,
        label: useWeeks ? shortDate(key) : shortDate(d.date),
        at1: d.at1,
        official: d.official_on_index,
      },
    ]
  })

  const yMax = Math.max(
    20,
    ...days.map((d) => d.n_queries || 0),
    ...days.map((d) => d.at1 || 0),
    ...days.map((d) => d.official_on_index || 0)
  )
  const yTicks = [0, 5, 10, 15, 20].filter((n) => n <= yMax)
  if (yTicks[yTicks.length - 1] !== yMax) yTicks.push(yMax)

  const W = 640
  const H = 200
  const pad = { l: 28, r: 18, t: 22, b: 28 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b
  const xOf = (i: number) =>
    pad.l + (ticks.length <= 1 ? innerW / 2 : (i / (ticks.length - 1)) * innerW)
  const yOf = (v: number) => pad.t + innerH * (1 - v / yMax)

  const series = (key: "at1" | "official") =>
    points.map((p) => {
      const i = ticks.indexOf(p.key)
      return `${xOf(i)},${yOf(p[key])}`
    })

  const last = points[points.length - 1]
  const active =
    hover != null && points[hover] ? points[hover] : last
  const activeI = active ? ticks.indexOf(active.key) : -1

  function onMove(ev: MouseEvent<SVGRectElement>) {
    const svg = ev.currentTarget.ownerSVGElement
    if (!svg || !points.length) return
    const rect = svg.getBoundingClientRect()
    const x = ((ev.clientX - rect.left) / rect.width) * W
    let best = 0
    let bestD = Infinity
    points.forEach((p, i) => {
      const d = Math.abs(xOf(ticks.indexOf(p.key)) - x)
      if (d < bestD) {
        best = i
        bestD = d
      }
    })
    setHover(bestD < 48 ? best : null)
  }

  return (
    <section className="mt-10">
      <Card className="gap-4 py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-base font-medium">Climb</CardTitle>
          <CardAction>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                aria-pressed={mode === "days"}
                onClick={() => setMode("days")}
                className={cn(
                  mode === "days" ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Days
              </button>
              <button
                type="button"
                aria-pressed={mode === "weeks"}
                onClick={() => setMode("weeks")}
                className={cn(
                  mode === "weeks" ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Weeks
              </button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="px-2 sm:px-5">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label="Queries at number one over days"
            onMouseLeave={() => setHover(null)}
          >
            {yTicks.map((n) => (
              <g key={n}>
                <line
                  x1={pad.l}
                  x2={W - pad.r}
                  y1={yOf(n)}
                  y2={yOf(n)}
                  className="stroke-border"
                  strokeWidth="1"
                />
                <text
                  x={pad.l - 8}
                  y={yOf(n) + 3}
                  textAnchor="end"
                  fontSize="11"
                  className="fill-muted-foreground tabular-nums"
                >
                  {n}
                </text>
              </g>
            ))}
            {ticks.map((t, i) => (
              <text
                key={t}
                x={xOf(i)}
                y={H - 8}
                textAnchor={
                  i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"
                }
                fontSize="11"
                className="fill-muted-foreground tabular-nums"
              >
                {useWeeks ? shortDate(t) : dayTickLabel(t, i, ticks)}
              </text>
            ))}
            {series("official").length > 1 ? (
              <polyline
                fill="none"
                points={series("official").join(" ")}
                className="stroke-muted-foreground/45"
                strokeWidth="1.25"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {series("at1").length > 1 ? (
              <polyline
                fill="none"
                points={series("at1").join(" ")}
                className="stroke-primary"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {points.map((p) => {
              const i = ticks.indexOf(p.key)
              return (
                <circle
                  key={`off-${p.key}`}
                  cx={xOf(i)}
                  cy={yOf(p.official)}
                  r="2.5"
                  className="fill-muted-foreground/55"
                />
              )
            })}
            {points.map((p) => {
              const i = ticks.indexOf(p.key)
              return (
                <circle
                  key={`at1-${p.key}`}
                  cx={xOf(i)}
                  cy={yOf(p.at1)}
                  r="3.5"
                  className="fill-primary"
                />
              )
            })}
            {last ? (
              <text
                x={xOf(ticks.indexOf(last.key)) + 8}
                y={yOf(last.at1) + 4}
                fontSize="11"
                className="fill-foreground tabular-nums"
              >
                {last.at1}
              </text>
            ) : null}
            {active && activeI >= 0 && hover != null ? (
              <text
                x={xOf(activeI)}
                y={pad.t - 4}
                textAnchor={
                  activeI === 0
                    ? "start"
                    : activeI === ticks.length - 1
                      ? "end"
                      : "middle"
                }
                fontSize="11"
                className="fill-muted-foreground tabular-nums"
              >
                {active.label} · {active.at1} at #1 · {active.official} on the index
              </text>
            ) : null}
            <rect
              x={pad.l}
              y={pad.t}
              width={innerW}
              height={innerH}
              fill="transparent"
              onMouseMove={onMove}
            />
          </svg>
        </CardContent>
      </Card>
    </section>
  )
}

export default function App() {
  const [data, setData] = useState<Status | null>(null)
  const [history, setHistory] = useState<History | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(statusUrl(), { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`status.json ${res.status}`)
        return res.json()
      })
      .then((json: Status) => {
        setData(json)
        if (json.history?.days?.length) {
          setHistory((prev) => prev ?? json.history ?? null)
        }
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load")
      )
    fetch(historyUrl(), { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`history.json ${res.status}`)
        return res.json()
      })
      .then((json: History) => {
        if (json?.days?.length) setHistory(json)
      })
      .catch(() => {
        /* hide the graph rather than invent points */
      })
  }, [])

  const ranks = data?.ranks
  const queries = ranks?.queries ?? []
  const sorted = useMemo(() => stairSorted(queries), [queries])
  const av = ranks?.averages
  const avg =
    av?.official_mean_when_ranked ??
    ranks?.official_average ??
    ranks?.website_average ??
    average(queries)
  const total = queries.length
  const at1 = queries.filter((row) => officialRank(row) === 1).length
  const officialHit = queries.filter((row) => officialRank(row) != null).length
  const wikiHit = queries.filter((row) => wikiRank(row) != null).length
  const when = ranks?.generated_at_et || ranks?.as_of_et || ""
  const disclaimer =
    ranks?.disclaimer ||
    ranks?.source_note ||
    "Search snapshot, not Google Search Console"

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-border pb-4">
        <h1 className="text-xl font-medium tracking-tight">CUPI SEO</h1>
        <p className="text-sm text-muted-foreground">
          {data?.generated_at_et ?? (error ? error : "...")}
        </p>
      </header>

      <section className="mt-12 sm:mt-16">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
          <p className="text-[clamp(5rem,16vw,10rem)] font-medium leading-none tracking-tight tabular-nums">
            {total ? at1 : "—"}
            <span className="text-muted-foreground"> / {total || "—"}</span>
          </p>
          <p className="mb-3 text-2xl font-medium text-muted-foreground sm:mb-5 sm:text-3xl">
            at #1
          </p>
        </div>
        <Progress
          value={pct(at1, total)}
          className="mt-6 h-16 w-full sm:h-20"
        />
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-4">
              <p className="text-sm">Official site on the index</p>
              <p className="tabular-nums text-sm">
                {total ? `${officialHit} / ${total}` : "—"}
              </p>
            </div>
            <Progress value={pct(officialHit, total)} className="h-2.5" />
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-4">
              <p className="text-sm">Wiki on the index</p>
              <p className="tabular-nums text-sm">
                {total ? `${wikiHit} / ${total}` : "—"}
              </p>
            </div>
            <Progress value={pct(wikiHit, total)} className="h-2.5" />
          </div>
        </div>
        <p className="mt-6 text-[15px] text-muted-foreground">
          Goal is #1 on every string, climbed closest first.
        </p>
      </section>

      {history?.days?.length ? <ClimbCard history={history} /> : null}

      <section className="mt-10">
        <p className="max-w-3xl text-[17px] leading-[1.7] text-foreground">
          {data?.brief ?? (error ? "Could not load the latest note." : "")}
        </p>
      </section>

      <section className="mt-10">
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-base font-medium">Search ranks</CardTitle>
            <CardAction className="max-w-[22rem] text-right text-xs text-muted-foreground">
              {disclaimer}
              {when ? ` · ${when}` : ""}
            </CardAction>
          </CardHeader>
          <CardContent className="px-2 sm:px-5">
            <p className="mb-3 px-3 text-sm sm:px-0">
              Official site average {avg ?? "—"}
              {officialHit ? ` on the ${officialHit} that ranked` : ""}. Wiki{" "}
              {wikiHit}/{total || 0}.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Query</TableHead>
                  <TableHead className="w-[9rem]">Official site</TableHead>
                  <TableHead className="w-[9rem]">Wiki</TableHead>
                  <TableHead className="w-[12rem]">Who is #1</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length ? (
                  sorted.map((row) => {
                    const official = officialRank(row)
                    return (
                      <TableRow key={qText(row)}>
                        <TableCell className="font-medium">
                          {qText(row)}
                        </TableCell>
                        <TableCell>
                          <div>
                            {rankCell(official)}
                            <Stair rank={official} />
                          </div>
                        </TableCell>
                        <TableCell>{rankCell(wikiRank(row))}</TableCell>
                        <TableCell>{row.top || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.notes || ""}
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No search snapshot on file.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableCaption>
                If a property is missing from the returned results, the cell
                says “not in results.” Ranks are never invented.
              </TableCaption>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <PropertyCard
          title="Website"
          body={data?.updates?.website}
          campaign={data?.campaigns?.website}
        />
        <PropertyCard
          title="Wiki"
          body={data?.updates?.wiki}
          campaign={data?.campaigns?.wiki}
        />
      </section>
    </div>
  )
}
