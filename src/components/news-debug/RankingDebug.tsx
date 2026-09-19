import { NewsDebugArticle } from "@/components/news-debug/NewsDebugArticle"
import type { RankingState } from "@/hooks/useRanking"

type RankingSuccess = Extract<RankingState, { status: "success" }>

/** TEMPORARY: shows which candidates the ranker selected (with its reasons) and which it left out. */
export function RankingDebug({ state }: { state: RankingSuccess }) {
  const { data, request, durationMs } = state
  const byId = new Map(request.articles.map((article) => [article.id, article]))
  const selectedIds = new Set(data.selected.map((story) => story.articleId))
  const rejected = request.articles.filter((article) => !selectedIds.has(article.id))

  const rows: [string, string | number][] = [
    ["Candidate articles", data.stats.candidates],
    ["Requested stories", request.maxStories],
    ["Selected", data.stats.selected],
    ["Model", data.stats.model],
    ["OpenAI call", `${(data.stats.durationMs / 1000).toFixed(1)}s`],
    ["Total request", `${(durationMs / 1000).toFixed(1)}s`],
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
      <p>
        <span className="text-muted-foreground">Interests used: </span>
        {request.interests.join(", ")}
      </p>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold text-foreground">Selected stories ({data.selected.length})</h3>
        {data.selected.length === 0 ? <p className="text-muted-foreground">The model selected nothing.</p> : null}
        <ol>
          {data.selected.map((story) => {
            const article = byId.get(story.articleId)
            if (!article) return null
            return (
              <li key={story.articleId} className="flex gap-3 border-b border-border py-3 last:border-b-0">
                <span className="w-8 shrink-0 text-right font-semibold text-foreground">#{story.rank}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{article.title}</p>
                  <p className="text-muted-foreground">{article.source}</p>
                  <p>
                    <span className="text-muted-foreground">Interest: </span>
                    {article.interests.join(", ")}
                  </p>
                  <p className="mt-1">
                    <span className="text-muted-foreground">Reason: </span>
                    {story.reason}
                  </p>
                  <a href={article.url} target="_blank" rel="noreferrer" className="block break-all text-primary underline">
                    {article.url}
                  </a>
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      <details className="rounded border border-border p-2">
        <summary className="cursor-pointer font-semibold">Rejected candidates ({rejected.length})</summary>
        <ol className="mt-2">
          {rejected.map((article, index) => (
            <NewsDebugArticle key={article.id} article={article} index={index} />
          ))}
        </ol>
      </details>
    </div>
  )
}
