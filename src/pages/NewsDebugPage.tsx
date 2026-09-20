import { useState } from "react"
import { NewsDebugArticle } from "@/components/news-debug/NewsDebugArticle"
import { NewsDebugSummary } from "@/components/news-debug/NewsDebugSummary"
import { RankingDebug } from "@/components/news-debug/RankingDebug"
import { ResearchDebug } from "@/components/news-debug/ResearchDebug"
import { ScriptDebug } from "@/components/news-debug/ScriptDebug"
import { ToneSelect } from "@/components/settings/ToneSelect"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useInterests } from "@/hooks/useInterests"
import { useNews } from "@/hooks/useNews"
import { usePodcastSettings } from "@/hooks/usePodcastSettings"
import { useRanking } from "@/hooks/useRanking"
import type { RankingState } from "@/hooks/useRanking"
import { useResearch } from "@/hooks/useResearch"
import type { ResearchState } from "@/hooks/useResearch"
import { useScript } from "@/hooks/useScript"
import { storiesForDuration } from "@/lib/rankingApi"
import { storiesForScript, storiesFromRanking } from "@/lib/scriptApi"
import { MAX_DURATION_MINUTES, MIN_DURATION_MINUTES } from "@/types"
import type { Article, NewsResponse, Tone } from "@/types"

/** TEMPORARY developer tool for inspecting the news pipeline. Not part of the product UI. */
export function NewsDebugPage() {
  useDocumentTitle("ProsperPod — News Debug")

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

      {/* Keyed on the ranking run so a new ranking discards the previous research and script. */}
      {state.status === "success" ? <EpisodeSection key={state.durationMs} ranking={state} /> : null}
    </section>
  )
}

type RankingSuccess = Extract<RankingState, { status: "success" }>

/** Research and the script share one research run: the script is written only from what research produced. */
function EpisodeSection({ ranking }: { ranking: RankingSuccess }) {
  const { state, research } = useResearch()

  return (
    <>
      <ResearchSection ranking={ranking} state={state} onResearch={(articles) => void research(articles)} />
      <ScriptSection ranking={ranking} research={state} />
    </>
  )
}

/** Explicit "Research Stories" action: Tavily and OpenAI are only called when this button is pressed. */
function ResearchSection({
  ranking,
  state,
  onResearch,
}: {
  ranking: RankingSuccess
  state: ResearchState
  onResearch: (articles: Article[]) => void
}) {
  const running = state.status === "running"
  const articles = storiesFromRanking(ranking.data.selected, ranking.request.articles).map(({ article }) => article)

  return (
    <section className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
      <h2 className="font-semibold text-foreground">Research / enrichment</h2>
      <p className="text-muted-foreground">
        Searches the web for sources on each of the {articles.length} ranked stories, reads the best ones, and builds
        source-backed facts, context, analysis and quotes. Stories without enough reliable material come back
        insufficient. Each story uses at most 3 Tavily searches and 5 page extractions. The script step below is written
        only from the stories that come back enriched.
      </p>
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={running || articles.length === 0} onClick={() => onResearch(articles)}>
          {running ? "Researching…" : "Research Stories"}
        </Button>
        {running ? <span className="text-muted-foreground">Stories are researched three at a time; this can take a minute or two.</span> : null}
      </div>

      {state.status !== "idle" ? <ResearchDebug state={state} /> : null}
    </section>
  )
}

/** Explicit "Generate Script" action: OpenAI is only called when this button is pressed. */
function ScriptSection({ ranking, research }: { ranking: RankingSuccess; research: ResearchState }) {
  const { settings } = usePodcastSettings()
  const [tone, setTone] = useState<Tone>(settings.tone)
  const [durationMinutes, setDurationMinutes] = useState(settings.durationMinutes)
  const { state, generate } = useScript()
  const loading = state.status === "loading"

  const ranked = storiesFromRanking(ranking.data.selected, ranking.request.articles)
  const researchFinished = research.status === "finished"
  // Research is the only source of facts: only stories it marked enriched can be scripted.
  const { stories, excluded } = storiesForScript(ranked, research.status === "idle" ? {} : research.byId)

  return (
    <section className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
      <h2 className="font-semibold text-foreground">AI script generation</h2>
      <p className="text-muted-foreground">
        Writes one episode (language: {settings.language}) from the stories research marked enriched. Duration is a
        target, not a minimum: when the researched material supports less, the episode is shorter rather than padded.
        Tone and duration start from your saved settings; changing them here does not save anything.
      </p>
      {research.status === "idle" ? (
        <p className="text-muted-foreground">Research the stories above first: a script is only written from researched stories.</p>
      ) : null}
      {research.status === "running" ? <p className="text-muted-foreground">Research is still running…</p> : null}
      {researchFinished ? (
        <div className="flex flex-col gap-1">
          <p className="text-foreground">
            {stories.length} of {ranked.length} ranked stories are enriched and will be used.
          </p>
          {excluded.length > 0 ? (
            <ul className="list-inside list-disc">
              {excluded.map(({ articleId, title, reason }) => (
                <li key={articleId}>
                  {title} <span className="text-muted-foreground">— left out, {reason}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex w-72 flex-col gap-1">
          Tone
          <ToneSelect value={tone} onChange={setTone} />
        </div>
        <label className="flex flex-col gap-1">
          Duration (min)
          <Input
            type="number"
            min={MIN_DURATION_MINUTES}
            max={MAX_DURATION_MINUTES}
            value={durationMinutes}
            onChange={(event) =>
              setDurationMinutes(
                Math.min(
                  MAX_DURATION_MINUTES,
                  Math.max(MIN_DURATION_MINUTES, Math.round(Number(event.target.value)) || MIN_DURATION_MINUTES),
                ),
              )
            }
            className="h-8 w-20 font-mono text-xs"
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={loading || !researchFinished || stories.length === 0}
          onClick={() =>
            void generate({ interests: ranking.request.interests, language: settings.language, durationMinutes, tone, stories })
          }
        >
          {loading ? "Writing script…" : "Generate Script"}
        </Button>
        {loading ? <span className="text-muted-foreground">Longer episodes can take a few minutes to write.</span> : null}
      </div>

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Script generation failed</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "success" ? <ScriptDebug state={state} /> : null}
    </section>
  )
}
