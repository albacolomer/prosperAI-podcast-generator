import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { ScriptState } from "@/hooks/useScript"
import type { EnrichedStory, EpisodePlan, ScriptValidation, SourcedClaim } from "@/types"

type ScriptSuccess = Extract<ScriptState, { status: "success" }>

function ClaimList({ title, claims }: { title: string; claims: SourcedClaim[] }) {
  if (claims.length === 0) return null
  return (
    <div>
      <p className="font-semibold text-foreground">
        {title} ({claims.length})
      </p>
      <ul className="list-inside list-disc">
        {claims.map((entry, index) => (
          <li key={index}>
            {entry.claim} <span className="text-muted-foreground">[{entry.sourceIds.join(", ")}]</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The research the writer was given for one story, so a segment can be checked against its evidence. */
function StoryEvidence({ story }: { story: EnrichedStory }) {
  return (
    <div className="mt-2 flex flex-col gap-2 border-l border-border pl-3">
      <ClaimList title="Facts" claims={story.facts} />
      <ClaimList title="Context" claims={story.context} />
      <ClaimList title="Analysis (not fact)" claims={story.analysis} />
      {story.quotes.length > 0 ? (
        <div>
          <p className="font-semibold text-foreground">Quotes ({story.quotes.length})</p>
          <ul>
            {story.quotes.map((quote, index) => (
              <li key={index}>
                “{quote.text}” <span className="text-muted-foreground">— {quote.speaker} [{quote.sourceId}]</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {story.disagreements.map((entry, index) => (
        <div key={index}>
          <p className="font-semibold text-foreground">Sources disagree: {entry.topic}</p>
          <ul className="list-inside list-disc">
            {entry.positions.map((position, positionIndex) => (
              <li key={positionIndex}>
                {position.claim} <span className="text-muted-foreground">[{position.sourceIds.join(", ")}]</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div>
        <p className="font-semibold text-foreground">Sources ({story.sources.length})</p>
        <ul>
          {story.sources.map((source) => (
            <li key={source.id}>
              <span className="mr-2 text-muted-foreground">{source.id}</span>
              <Badge variant="outline" className="mr-2">
                {source.type}
              </Badge>
              <a href={source.url} target="_blank" rel="noreferrer" className="break-all text-primary underline">
                {source.title || source.domain} · {source.domain}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** The researched stories a segment draws on. Open one to see exactly what the writer was given for it. */
function StoryRefs({ ids, byId }: { ids: string[]; byId: Map<string, EnrichedStory> }) {
  if (ids.length === 0) return <p className="text-muted-foreground">Stories: none</p>
  return (
    <ul className="flex flex-col gap-0.5">
      {ids.map((id) => {
        const story = byId.get(id)
        return (
          <li key={id} className="text-muted-foreground">
            {story ? (
              <details>
                <summary className="cursor-pointer">
                  <span className="mr-2">{id}</span>
                  <span className="text-foreground/80">{story.headline}</span> · {story.facts.length} facts · {story.sources.length} sources
                </summary>
                <StoryEvidence story={story} />
              </details>
            ) : (
              <>
                <span className="mr-2">{id}</span>
                <em>(unknown story)</em>
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable (insecure context or denied) — the text can still be selected by hand.
    }
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
      {copied ? "Copied" : "Copy script"}
    </Button>
  )
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`

/** The quality gate: errors block, warnings are advice. Every issue says what is wrong and, where it can, quotes the text. */
function ValidationPanel({ validation }: { validation: ScriptValidation }) {
  const { stats } = validation
  return (
    <section className="flex flex-col gap-2">
      <h4 className="flex items-center gap-2 font-semibold text-foreground">
        Validation
        <Badge variant={validation.passed ? "secondary" : "destructive"}>{validation.passed ? "PASSED" : "FAILED"}</Badge>
      </h4>
      <p className="text-muted-foreground">
        {stats.errors} errors · {stats.warnings} warnings · {stats.wordCount} words (min {stats.minWords} / target {stats.targetWords} / max{" "}
        {stats.maxWords}) · {stats.storiesCovered} of {stats.storiesPlanned} planned stories told · {stats.quotesUsed} verified quotes used · AI
        review: {stats.aiReview}
      </p>
      {validation.issues.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {validation.issues.map((issue, index) => (
            <li key={index} className="border-l-2 border-border pl-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={issue.severity === "error" ? "destructive" : "outline"}>{issue.severity}</Badge>
                <Badge variant="secondary">{issue.source}</Badge>
                <span className="font-semibold text-foreground">{issue.type}</span>
                {issue.segmentIndex ? <span className="text-muted-foreground">segment {issue.segmentIndex}</span> : null}
              </div>
              <p className="text-foreground/90">{issue.message}</p>
              {issue.excerpt ? <p className="text-muted-foreground">“{issue.excerpt}”</p> : null}
              {issue.evidenceIds?.length ? <p className="text-muted-foreground">evidence: {issue.evidenceIds.join(", ")}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/** The editorial plan the writer executed: what was told, in what order, with what evidence, and what was left out. */
function PlanPanel({ plan, byId }: { plan: EpisodePlan; byId: Map<string, EnrichedStory> }) {
  const headline = (id: string) => byId.get(id)?.headline ?? id
  return (
    <section className="flex flex-col gap-2">
      <h4 className="font-semibold text-foreground">Episode plan</h4>
      <p className="text-foreground/90">
        <span className="text-muted-foreground">Working title:</span> {plan.title}
      </p>
      <p className="text-foreground/90">
        <span className="text-muted-foreground">Angle:</span> {plan.angle || "—"}
      </p>
      <p className="text-muted-foreground">
        Hook {plan.hookTargetWords} words · outro {plan.outroTargetWords} words · {plan.totalTargetWords} words planned in total
      </p>
      <ol className="flex flex-col gap-1">
        {plan.stories.map((entry, index) => (
          <li key={entry.storyId} className="text-foreground/90">
            {index + 1}. <Badge variant="secondary">{entry.role}</Badge> {headline(entry.storyId)}{" "}
            <span className="text-muted-foreground">
              — {entry.targetWords} words · facts {entry.selectedFactIds.join(",") || "-"} · context {entry.selectedContextIds.join(",") || "-"} ·
              analysis {entry.selectedAnalysisIds.join(",") || "-"} · quotes {entry.selectedQuoteIds.join(",") || "-"} · disagreements{" "}
              {entry.selectedDisagreementIds.join(",") || "-"}
            </span>
            <br />
            <span className="text-muted-foreground">{entry.reason}</span>
          </li>
        ))}
      </ol>
      {plan.connections.length > 0 ? (
        <div>
          <p className="font-semibold text-foreground">Connections</p>
          <ul className="list-inside list-disc">
            {plan.connections.map((connection, index) => (
              <li key={index}>
                {headline(connection.fromStoryId)} → {headline(connection.toStoryId)}: {connection.idea}
                <br />
                <span className="text-muted-foreground">
                  basis ({connection.basisType}): “{connection.basis}” · evidence [{connection.fromEvidenceIds.join(",")} / {connection.toEvidenceIds.join(",")}]
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-muted-foreground">No connections planned: the stories are told in sequence.</p>
      )}
      {plan.adjustments.length > 0 ? (
        <div>
          <p className="font-semibold text-foreground">Adjusted by the server</p>
          <ul className="list-inside list-disc">
            {plan.adjustments.map((adjustment, index) => (
              <li key={index}>{adjustment}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {plan.omitted.length > 0 ? (
        <div>
          <p className="font-semibold text-foreground">Omitted by the plan ({plan.omitted.length})</p>
          <ul className="list-inside list-disc">
            {plan.omitted.map(({ storyId, reason }) => (
              <li key={storyId}>
                {headline(storyId)} <span className="text-muted-foreground">— {reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

/** TEMPORARY: shows the generated episode: plan, validation, structured segments with the researched stories behind each, and the full script. */
export function ScriptDebug({ state }: { state: ScriptSuccess }) {
  const { data, request, durationMs } = state
  const { stats, stages } = data
  const byId = new Map(request.stories.map(({ story }) => [story.storyId, story]))
  const evidence = { facts: 0, context: 0, analysis: 0, quotes: 0 }
  for (const { story } of request.stories) {
    evidence.facts += story.facts.length
    evidence.context += story.context.length
    evidence.analysis += story.analysis.length
    evidence.quotes += story.quotes.length
  }

  const rows: [string, string | number][] = [
    ["Tone", request.tone],
    ["Language", request.language],
    ["Target duration", `${stats.targetMinutes} min (~${stats.targetWords} words)`],
    ["Generated", `${stats.wordCount} words (~${stats.estimatedMinutes} min)`],
    ["Length vs target", `${Math.round((stats.wordCount / stats.targetWords) * 100)}%`],
    ["Stories used", `${stats.storiesCovered} of ${stats.storiesProvided} researched`],
    ["Stories omitted", stats.storiesOmitted],
    ["Research given", `${evidence.facts} facts · ${evidence.context} context · ${evidence.analysis} analysis · ${evidence.quotes} quotes`],
    ["Segments", data.segments.length],
    ["Validation", data.validation.passed ? "passed" : "FAILED"],
    ["Planner", `${stages.planner.model} · ${seconds(stages.planner.durationMs)}`],
    ["Writer", `${stages.writer.model} · ${seconds(stages.writer.durationMs)}`],
    ["Validator", `${stages.validator.model} · ${seconds(stages.validator.durationMs)}`],
    ["Server total", seconds(stages.totalMs)],
    ["Total request", seconds(durationMs)],
  ]

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold text-foreground">{data.title}</h3>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2 border-b border-border py-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      <ValidationPanel validation={data.validation} />
      <PlanPanel plan={data.plan} byId={byId} />

      <section className="flex flex-col gap-2">
        <h4 className="font-semibold text-foreground">Segments ({data.segments.length})</h4>
        <ol>
          {data.segments.map((segment, index) => (
            <li key={index} className="flex gap-3 border-b border-border py-3 last:border-b-0">
              <span className="w-6 shrink-0 text-right text-muted-foreground">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="secondary">{segment.type}</Badge>
                  <span className="text-muted-foreground">{segment.text.split(/\s+/).length} words</span>
                </div>
                <p className="whitespace-pre-wrap text-foreground/90">{segment.text}</p>
                <div className="mt-2">
                  <StoryRefs ids={segment.articleIds} byId={byId} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h4 className="font-semibold text-foreground">Full script (reconstructed from segments)</h4>
          <CopyButton text={data.script} />
        </div>
        <div className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded border border-border bg-muted/40 p-3 font-sans text-sm leading-relaxed text-foreground">
          {data.script}
        </div>
      </section>
    </div>
  )
}
