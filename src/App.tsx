import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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

type Status = {
  generated_at_et?: string
  brief?: string
  updates?: { website?: string; wiki?: string }
  ranks?: Ranks | null
  campaigns?: { website?: Campaign; wiki?: Campaign }
}

function statusUrl() {
  return `${import.meta.env.BASE_URL}status.json`
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

export default function App() {
  const [data, setData] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(statusUrl(), { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`status.json ${res.status}`)
        return res.json()
      })
      .then((json: Status) => setData(json))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load")
      )
  }, [])

  const ranks = data?.ranks
  const queries = ranks?.queries ?? []
  const av = ranks?.averages
  const avg =
    av?.official_mean_when_ranked ??
    ranks?.official_average ??
    ranks?.website_average ??
    average(queries)
  const ranked = av?.official_ranked_count
  const wikiHit = av?.wiki_ranked_count
  const wikiN = av?.wiki_miss_count ?? queries.length
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

      <section className="mt-8">
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
              {ranked != null ? ` on the ${ranked} that ranked` : ""}. Wiki{" "}
              {wikiHit ?? 0}/{wikiN}.
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
                {queries.length ? (
                  queries.map((row) => (
                    <TableRow key={qText(row)}>
                      <TableCell className="font-medium">{qText(row)}</TableCell>
                      <TableCell>{rankCell(officialRank(row))}</TableCell>
                      <TableCell>{rankCell(wikiRank(row))}</TableCell>
                      <TableCell>{row.top || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.notes || ""}
                      </TableCell>
                    </TableRow>
                  ))
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
