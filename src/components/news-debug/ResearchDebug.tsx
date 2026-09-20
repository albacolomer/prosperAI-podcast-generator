import { Badge } from "@/components/ui/badge"
import type { ResearchState, StoryResearchState } from "@/hooks/useResearch"
import type { Article, EnrichedStory, ResearchStatus, SourcedClaim } from "@/types"

type ResearchStarted = Extract<ResearchState, { status: "running" | "finished" }>

const STATUS_VARIANT: Record<ResearchStatus, "default" | "secondary" | "destructive"> = {
  enriched: "default",
  insufficient: "secondary",
  failed: "destructive",
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

function SourceRefs({ ids }: { ids: string[] }) {
  return <span className="ml-2 text-muted-foreground">[{ids.join(", ")}]</span>
}

function ClaimList({ title, claims }: { title: string; claims: SourcedClaim[] }) {
  return (
    <section className="flex flex-col gap-1">
      <h5 className="font-semibold text-foreground">
        {title} ({claims.length})
      </h5>
      {claims.length === 0 ? <p className="text-muted-foreground">None.</p> : null}
      <ul className="list-inside list-disc">
        {claims.map((entry, index) => (
          <li key={index}>
            {entry.claim}
            <SourceRefs ids={entry.sourceIds} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function StoryResult({ story }: { story: EnrichedStory }) {
  const { trace } = story
  const sourceById = new Map(story.sources.map((source) => [source.id, source]))

  return (
    <div className="flex flex-col gap-4">
      {story.statusReason ? (
        <p>
          <span className="text-muted-foreground">Reason: </span>
          {story.statusReason}
        </p>
      ) : null}
      {story.summary ? (
        <p>
          <span className="text-muted-foreground">Summary: </span>
          {story.summary}
        </p>
      ) : null}

      {story.status === "enriched" ? (
        <>
          <ClaimList title="Facts" claims={story.facts} />
          <ClaimList title="Context" claims={story.context} />
          <ClaimList title="Analysis (not fact)" claims={story.analysis} />

          <section className="flex flex-col gap-1">
            <h5 className="font-semibold text-foreground">Quotes ({story.quotes.length})</h5>
            {story.quotes.length === 0 ? <p className="text-muted-foreground">None.</p> : null}
            <ul className="flex flex-col gap-1">
              {story.quotes.map((quote, index) => (
                <li key={index}>
                  “{quote.text}” <span className="text-muted-foreground">— {quote.speaker}</span>
                  <SourceRefs ids={[quote.sourceId]} />
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-1">
            <h5 className="font-semibold text-foreground">Unresolved disagreements ({story.disagreements.length})</h5>
            {story.disagreements.length === 0 ? <p className="text-muted-foreground">None.</p> : null}
            {story.disagreements.map((entry, index) => (
              <div key={index} className="rounded border border-border p-2">
                <p className="font-semibold">{entry.topic}</p>
                <ul className="list-inside list-disc">
                  {entry.positions.map((position, positionIndex) => (
                    <li key={positionIndex}>
                      {position.claim}
                      <SourceRefs ids={position.sourceIds} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-1">
            <h5 className="font-semibold text-foreground">Sources relied on ({story.sources.length})</h5>
            <ul>
              {[...sourceById.values()].map((source) => (
                <li key={source.id}>
                  <span className="mr-2 text-muted-foreground">{source.id}</span>
                  <Badge variant="outline" className="mr-2">
                    {source.type}
                  </Badge>
                  <a href={source.url} target="_blank" rel="noreferrer" className="break-all text-primary underline">
                    {source.title} · {source.domain}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {trace ? (
        <>
          <section className="flex flex-col gap-1">
            <h5 className="font-semibold text-foreground">Search queries ({trace.queries.length})</h5>
            <ol className="list-inside list-decimal">
              {trace.queries.map((query, index) => (
                <li key={index}>
                  {query.query}{" "}
                  <span className="text-muted-foreground">
                    ({query.purpose}, {query.topic}, {query.results} results
                    {query.error ? `, error: ${query.error}` : ""})
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {trace.candidates.length > 0 ? (
            <details className="rounded border border-border p-2">
              <summary className="cursor-pointer font-semibold">
                Candidates ({trace.candidates.length}: {trace.candidates.filter((c) => c.outcome === "selected").length} selected,{" "}
                {trace.candidates.filter((c) => c.outcome === "filtered").length} filtered)
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {trace.candidates.map((candidate, index) => (
                  <li key={index} className="border-b border-border pb-2 last:border-b-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={candidate.outcome === "selected" ? "default" : "secondary"}>{candidate.outcome}</Badge>
                      {candidate.sourceType ? <Badge variant="outline">{candidate.sourceType}</Badge> : null}
                      {candidate.origin === "original" ? <Badge variant="outline">original GNews article</Badge> : null}
                      {candidate.sourceId ? <span className="text-muted-foreground">{candidate.sourceId}</span> : null}
                      <span className="font-semibold text-foreground">{candidate.title || "(no title)"}</span>
                    </div>
                    <a href={candidate.url} target="_blank" rel="noreferrer" className="block break-all text-primary underline">
                      {candidate.url}
                    </a>
                    <p className="text-muted-foreground">
                      {candidate.domain}
                      {candidate.score !== null ? ` · score ${candidate.score.toFixed(2)}` : ""} · {candidate.reason}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {trace.extractions.length > 0 ? (
            <details className="rounded border border-border p-2" open={trace.extractions.length > 0 && story.status !== "enriched"}>
              <summary className="cursor-pointer font-semibold">
                Extraction &amp; content validation ({trace.extractions.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {trace.extractions.map((extraction) => (
                  <li key={extraction.sourceId} className="border-b border-border pb-2 last:border-b-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">{extraction.sourceId}</span>
                      <Badge variant={extraction.usable ? "default" : "destructive"}>
                        {!extraction.extracted ? "extraction failed" : extraction.usable ? "usable" : "unusable"}
                      </Badge>
                      <span>{extraction.domain}</span>
                      {extraction.extracted ? <span className="text-muted-foreground">{extraction.chars} chars</span> : null}
                    </div>
                    {extraction.error ? <p className="text-destructive">{extraction.error}</p> : null}
                    {extraction.issues.length > 0 ? (
                      <p className="text-destructive">Validation: {extraction.issues.join("; ")}</p>
                  ) : null}
                  {extraction.preview ? (
                    <details>
                      <summary className="cursor-pointer text-muted-foreground">Content preview</summary>
                      <p className="mt-1 whitespace-pre-wrap text-foreground/80">
                        {extraction.preview}
                        {extraction.chars > extraction.preview.length ? "…" : ""}
                      </p>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
          ) : null}

          {trace.notes.length > 0 ? (
            <section className="flex flex-col gap-1">
              <h5 className="font-semibold text-foreground">Research notes</h5>
              <ul className="list-inside list-disc text-muted-foreground">
                {trace.notes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function StoryCard({ rank, article, state }: { rank: number; article: Article; state: StoryResearchState }) {
  const status = state.status === "done" ? state.story.status : state.status === "error" ? "failed" : null

  return (
    <li className="border-b border-border py-3 last:border-b-0">
      <details open={state.status === "error" || (state.status === "done" && state.story.status !== "enriched")}>
        <summary className="flex cursor-pointer flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">#{rank}</span>
          {status ? <Badge variant={STATUS_VARIANT[status]}>{status}</Badge> : <Badge variant="outline">researching…</Badge>}
          <span className="min-w-0 flex-1 font-semibold text-foreground">{article.title}</span>
          {state.status === "done" ? (
            <span className="text-muted-foreground">
              {plural(state.stats.tavilySearches, "search", "searches")} · {plural(state.stats.tavilyExtractions, "extraction")} ·{" "}
              {seconds(state.durationMs)}
            </span>
          ) : null}
        </summary>

        <div className="mt-3 flex flex-col gap-4 pl-4">
          <div>
            <p className="text-muted-foreground">
              {article.source} · {article.publishedAt}
            </p>
            <a href={article.url} target="_blank" rel="noreferrer" className="block break-all text-primary underline">
              {article.url}
            </a>
            <p className="mt-1">
              <span className="text-muted-foreground">GNews description: </span>
              {article.description || "(none)"}
            </p>
          </div>
          {state.status === "error" ? <p className="text-destructive">{state.message}</p> : null}
          {state.status === "done" ? <StoryResult story={state.story} /> : null}
        </div>
      </details>
    </li>
  )
}

/** TEMPORARY: shows what research found for each story, and why sources were selected or rejected. */
export function ResearchDebug({ state }: { state: ResearchStarted }) {
  const results = state.articles.map((article) => state.byId[article.id])
  const count = (status: ResearchStatus) =>
    results.filter((result) => (result.status === "done" ? result.story.status === status : status === "failed" && result.status === "error")).length
  const done = results.filter((result) => result.status !== "loading")
  const searches = done.reduce((sum, result) => sum + (result.status === "done" ? result.stats.tavilySearches : 0), 0)
  const extractions = done.reduce((sum, result) => sum + (result.status === "done" ? result.stats.tavilyExtractions : 0), 0)
  const model = done.flatMap((result) => (result.status === "done" ? [result.stats.model] : []))[0]

  const rows: [string, string | number][] = [
    ["Stories researched", `${done.length} of ${state.articles.length}`],
    ["Enriched", count("enriched")],
    ["Insufficient", count("insufficient")],
    ["Failed", count("failed")],
    ["Tavily searches", searches],
    ["Tavily extractions", extractions],
    ["Model", model ?? "—"],
    ["Total time", state.durationMs !== undefined ? seconds(state.durationMs) : "running…"],
  ]

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2 border-b border-border py-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <ol>
        {state.articles.map((article, index) => (
          <StoryCard key={article.id} rank={index + 1} article={article} state={state.byId[article.id]} />
        ))}
      </ol>
    </div>
  )
}
