import { useState } from "react"
import { NewsDebugArticle } from "@/components/news-debug/NewsDebugArticle"
import { NewsDebugSummary } from "@/components/news-debug/NewsDebugSummary"
import { RankingDebug } from "@/components/news-debug/RankingDebug"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useInterests } from "@/hooks/useInterests"
import { useNews } from "@/hooks/useNews"
import { usePodcastSettings } from "@/hooks/usePodcastSettings"
import { useRanking } from "@/hooks/useRanking"
import { storiesForDuration } from "@/lib/rankingApi"
import type { Article, NewsResponse } from "@/types"

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
          Temporary developer tool. Shows what /api/news returns for your selected interests, then lets you run the AI story ranking on those candidates.
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

      {state.status === "success" ? (
        <Results data={state.data} durationMs={state.durationMs} interests={queried} />
      ) : null}
    </div>
  )
}

function Results({ data, durationMs, interests }: { data: NewsResponse; durationMs: number; interests: string[] }) {
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

      {data.articles.length > 0 ? (
        // Keyed on the fetch time so a fresh fetch discards the previous ranking.
        <RankingSection key={durationMs} articles={data.articles} interests={interests} />
      ) : null}

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

/** Explicit "Rank Stories" action: OpenAI is only called when this button is pressed. */
function RankingSection({ articles, interests }: { articles: Article[]; interests: string[] }) {
  const { settings } = usePodcastSettings()
  const derivedStories = storiesForDuration(settings.durationMinutes)
  const [maxStories, setMaxStories] = useState(derivedStories)
  const { state, rank } = useRanking()
  const loading = state.status === "loading"

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold text-foreground">AI story ranking</h2>
      <p className="text-muted-foreground">
        Saved duration is {settings.durationMinutes} min, which suggests {derivedStories} stories. Ranking sends{" "}
        {articles.length} candidates to OpenAI.
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2">
          Max stories
          <Input
            type="number"
            min={1}
            max={20}
            value={maxStories}
            onChange={(event) => setMaxStories(Math.min(20, Math.max(1, Number(event.target.value) || 1)))}
            className="h-8 w-16 font-mono text-xs"
          />
        </label>
        <Button size="sm" disabled={loading} onClick={() => void rank({ interests, articles, maxStories })}>
          {loading ? "Ranking…" : "Rank Stories"}
        </Button>
      </div>

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Ranking failed</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "success" ? <RankingDebug state={state} /> : null}
    </section>
  )
}
