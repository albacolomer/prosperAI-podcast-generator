import { NewsDebugArticle } from "@/components/news-debug/NewsDebugArticle"
import { NewsDebugSummary } from "@/components/news-debug/NewsDebugSummary"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useInterests } from "@/hooks/useInterests"
import { useNews } from "@/hooks/useNews"
import type { NewsResponse } from "@/types"

/** TEMPORARY developer tool for inspecting the news pipeline. Not part of the product UI. */
export function NewsDebugPage() {
  useDocumentTitle("Echo — News Debug")

  const { interests } = useInterests()
  const { state, load } = useNews({ debug: true })
  const queried = interests.filter((interest) => interest.selected).map((interest) => interest.label)
  const loading = state.status === "loading"

  return (
    <div className="flex flex-col gap-6 font-mono text-xs">
      <div>
        <h1 className="text-lg font-semibold text-foreground">News Debug</h1>
        <p className="text-muted-foreground">
          Temporary developer tool. Shows what /api/news returns for your selected interests, before any AI ranking.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-foreground">Interests being queried ({queried.length})</h2>
        {queried.length > 0 ? (
          <ul className="list-inside list-disc">
            {queried.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">None selected. Select interests on the Home page first.</p>
        )}
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={loading || queried.length === 0} onClick={() => void load(queried)}>
            {loading ? "Fetching…" : "Fetch News"}
          </Button>
          {loading ? (
            <span className="text-muted-foreground">
              GNews requests are paced ~1.1s apart, so this takes a few seconds.
            </span>
          ) : null}
        </div>
      </section>

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Request failed</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "success" ? <Results data={state.data} durationMs={state.durationMs} /> : null}
    </div>
  )
}

function Results({ data, durationMs }: { data: NewsResponse; durationMs: number }) {
  const completeFailure = data.articles.length === 0 && data.errors.length > 0

  return (
    <>
      {data.errors.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>{completeFailure ? "Every lookup failed" : "Partial errors"}</AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc">
              {data.errors.map((error) => (
                <li key={`${error.interest}-${error.message}`}>
                  {error.interest}: {error.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-foreground">Pipeline summary</h2>
        <NewsDebugSummary data={data} durationMs={durationMs} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-foreground">Results: {data.articles.length} articles</h2>
        {data.articles.length === 0 && !completeFailure ? (
          <p className="text-muted-foreground">No articles returned.</p>
        ) : null}
        <ol>
          {data.articles.map((article, index) => (
            <NewsDebugArticle key={article.id} article={article} index={index} />
          ))}
        </ol>
      </section>
    </>
  )
}
