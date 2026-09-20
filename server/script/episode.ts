import type { ScriptResponse } from "../../src/types/script.js"
import type { NewsLogger } from "../news/log.js"
import { indexStory } from "./evidence.js"
import { scriptLog } from "./log.js"
import { targetWordsFor, WORDS_PER_MINUTE } from "./options.js"
import { planEpisode } from "./planner.js"
import type { PlannerModel } from "./planner.js"
import type { ScriptPromptInput } from "./prompt.js"
import type { ReviewModel } from "./review.js"
import { validateScript } from "./validator.js"
import { writeScript } from "./writer.js"
import type { ScriptModel } from "./writer.js"

/** What an episode needs to be produced: the user's choices and the researched stories (no plan, that is made here). */
export type EpisodeInput = Omit<ScriptPromptInput, "plan">

interface EpisodeConfig {
  planner: { model: PlannerModel; modelName: string }
  writer: { model: ScriptModel; modelName: string }
  reviewer: { model: ReviewModel; modelName: string }
  log?: NewsLogger
  clock?: () => number
}

/**
 * researched stories + interests + language + tone + duration
 *   -> Episode Planner (what to tell)  -> Script Writer (how to say it)  -> Script Validator (is it fit to voice).
 * Each stage stays independent and knows nothing about audio. A failed validation is reported in the response, not
 * repaired: the script is returned with `validation.passed === false` and its issues.
 */
export async function generateEpisode(
  input: EpisodeInput,
  { planner, writer, reviewer, log = scriptLog, clock = () => performance.now() }: EpisodeConfig,
): Promise<ScriptResponse> {
  const startedAt = clock()
  const { stories, language, tone, durationMinutes } = input

  const evidence = { facts: 0, context: 0, analysis: 0, quotes: 0 }
  for (const { story } of stories) {
    evidence.facts += story.facts.length
    evidence.context += story.context.length
    evidence.analysis += story.analysis.length
    evidence.quotes += story.quotes.length
  }
  log(`Stories: ${stories.length} researched (${evidence.facts} facts, ${evidence.context} context, ${evidence.analysis} analysis, ${evidence.quotes} quotes)`)

  const planned = await planEpisode(input, { model: planner.model, modelName: planner.modelName, log, clock })
  const written = await writeScript({ ...input, plan: planned.plan }, { model: writer.model, log, clock })
  const validated = await validateScript(
    {
      segments: written.segments,
      language,
      tone,
      durationMinutes,
      plan: planned.plan,
      stories: stories.map(({ story }) => indexStory(story)),
    },
    { reviewModel: reviewer.model, log, clock },
  )

  const totalMs = clock() - startedAt
  log(`Episode ready in ${(totalMs / 1000).toFixed(1)}s (plan ${(planned.durationMs / 1000).toFixed(1)}s, write ${(written.durationMs / 1000).toFixed(1)}s, validate ${(validated.durationMs / 1000).toFixed(1)}s)`)

  return {
    title: written.title,
    segments: written.segments,
    omitted: planned.plan.omitted.map(({ storyId, reason }) => ({ articleId: storyId, reason })),
    script: written.script,
    stats: {
      storiesProvided: stories.length,
      storiesCovered: validated.validation.stats.storiesCovered,
      storiesOmitted: planned.plan.omitted.length,
      wordCount: written.wordCount,
      targetWords: targetWordsFor(durationMinutes),
      targetMinutes: durationMinutes,
      estimatedMinutes: Math.round((written.wordCount / WORDS_PER_MINUTE) * 10) / 10,
      model: writer.modelName,
      durationMs: written.durationMs,
    },
    plan: planned.plan,
    validation: validated.validation,
    stages: {
      planner: { model: planner.modelName, durationMs: planned.durationMs },
      writer: { model: writer.modelName, durationMs: written.durationMs },
      validator: { model: reviewer.modelName, durationMs: validated.durationMs },
      totalMs,
    },
  }
}
