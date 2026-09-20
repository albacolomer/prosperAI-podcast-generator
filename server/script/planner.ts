import { z } from "zod"
import type { EpisodePlan } from "../../src/types/plan.js"
import type { NewsLogger } from "../news/log.js"
import { ScriptError } from "./errors.js"
import { evidenceIdsOf, evidenceTextOf, indexStory } from "./evidence.js"
import type { IndexedStory } from "./evidence.js"
import { scriptLog } from "./log.js"
import { maxWordsFor, targetWordsFor } from "./options.js"
import { buildPlannerSystemPrompt, buildPlannerUserPrompt } from "./plannerPrompt.js"
import type { PlannerPromptInput } from "./plannerPrompt.js"

export interface PlannerPrompt {
  system: string
  user: string
}

/** Sends the prompt to the LLM and returns its raw structured (JSON) answer. */
export type PlannerModel = (prompt: PlannerPrompt) => Promise<string>

interface PlannerConfig {
  model: PlannerModel
  modelName: string
  log?: NewsLogger
  clock?: () => number
}

const ids = z.array(z.string())

const modelPlanSchema = z.object({
  title: z.string().trim().min(1),
  angle: z.string().trim(),
  stories: z
    .array(
      z.object({
        storyId: z.string(),
        role: z.enum(["main", "supporting"]),
        targetWords: z.number().int().min(1),
        selectedFactIds: ids,
        selectedContextIds: ids,
        selectedAnalysisIds: ids,
        selectedQuoteIds: ids,
        selectedDisagreementIds: ids,
        reason: z.string().trim(),
      }),
    )
    .min(1),
  omitted: z.array(z.object({ storyId: z.string(), reason: z.string().trim() })),
  connections: z.array(
    z.object({
      fromStoryId: z.string(),
      toStoryId: z.string(),
      basisType: z.enum(["shared-actor", "same-entity-or-event", "same-location", "same-fact", "stated-by-source"]),
      basis: z.string().trim().min(1),
      idea: z.string().trim().min(1),
      fromEvidenceIds: ids,
      toEvidenceIds: ids,
    }),
  ),
  hookTargetWords: z.number().int().min(1),
  outroTargetWords: z.number().int().min(1),
})

function invalidPlan(message: string): ScriptError {
  return new ScriptError("invalid-output", `The episode planner returned an invalid plan: ${message}`)
}

/** A story uses at most one direct quote: a quote is a spice, and zero is a perfectly good number. */
export const MAX_QUOTES_PER_STORY = 1

const comparable = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()

/**
 * Whether `basis` is a named thing rather than a general topic: with cased letters it needs a capital (or a digit),
 * so "electricity prices" or "AI compute" as a shared "thing" is refused while "Nvidia" or "Climate Week NYC" passes.
 * Scripts without case (Japanese, Chinese, Arabic...) cannot be judged this way and pass.
 */
function looksNamed(basis: string): boolean {
  return !/\p{Ll}|\p{Lu}/u.test(basis) || /\p{Lu}|\p{N}/u.test(basis)
}

/**
 * Turns the planner's raw answer into a trusted plan. The planner is never trusted: every story and evidence id
 * must resolve to Research, every story is used or omitted exactly once, connections must rest on selected evidence
 * on both sides, and the word budget must fit the episode. The opening and ending stories are derived from the order.
 */
export function parsePlan(raw: string, stories: readonly IndexedStory[], durationMinutes: number): EpisodePlan {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw invalidPlan("it was not valid JSON")
  }
  const parsed = modelPlanSchema.safeParse(json)
  if (!parsed.success) throw invalidPlan("it did not match the expected shape")
  const data = parsed.data

  const byId = new Map(stories.map((indexed) => [indexed.story.storyId, indexed]))
  const evidenceIds = new Map(stories.map((indexed) => [indexed.story.storyId, evidenceIdsOf(indexed)]))

  const planned = new Set<string>()
  for (const entry of data.stories) {
    const known = evidenceIds.get(entry.storyId)
    if (!known) throw invalidPlan("it planned a story that was not in the provided stories")
    if (planned.has(entry.storyId)) throw invalidPlan("it planned the same story more than once")
    planned.add(entry.storyId)

    const kinds = [
      ["f", entry.selectedFactIds],
      ["c", entry.selectedContextIds],
      ["a", entry.selectedAnalysisIds],
      ["q", entry.selectedQuoteIds],
      ["d", entry.selectedDisagreementIds],
    ] as const
    for (const [prefix, selected] of kinds) {
      if (new Set(selected).size !== selected.length) throw invalidPlan("it selected the same evidence item twice")
      for (const id of selected) {
        if (!known.has(id) || !id.startsWith(prefix)) throw invalidPlan("it selected evidence that does not exist in the story")
      }
    }
    if (entry.selectedFactIds.length === 0) throw invalidPlan("it planned a story without selecting any fact")
  }

  const omitted = new Set<string>()
  for (const { storyId } of data.omitted) {
    if (!byId.has(storyId)) throw invalidPlan("it omitted a story that was not in the provided stories")
    if (omitted.has(storyId)) throw invalidPlan("it omitted the same story more than once")
    if (planned.has(storyId)) throw invalidPlan("it both planned and omitted the same story")
    omitted.add(storyId)
  }
  for (const storyId of byId.keys()) {
    if (!planned.has(storyId) && !omitted.has(storyId)) throw invalidPlan("it neither planned nor omitted every provided story")
  }

  // At most one quote per story: keep the first, and say so.
  const adjustments: string[] = []
  const plannedStories = data.stories.map((entry) => {
    if (entry.selectedQuoteIds.length <= MAX_QUOTES_PER_STORY) return entry
    adjustments.push(`Kept only quote ${entry.selectedQuoteIds[0]} of ${entry.selectedQuoteIds.length} selected for story "${entry.storyId}" (at most ${MAX_QUOTES_PER_STORY} per story)`)
    return { ...entry, selectedQuoteIds: entry.selectedQuoteIds.slice(0, MAX_QUOTES_PER_STORY) }
  })

  const selectedIds = (storyId: string) => {
    const entry = plannedStories.find((candidate) => candidate.storyId === storyId)
    return new Set(
      entry
        ? [...entry.selectedFactIds, ...entry.selectedContextIds, ...entry.selectedAnalysisIds, ...entry.selectedQuoteIds, ...entry.selectedDisagreementIds]
        : [],
    )
  }
  for (const connection of data.connections) {
    if (!planned.has(connection.fromStoryId) || !planned.has(connection.toStoryId)) {
      throw invalidPlan("it connected a story that is not in the episode")
    }
    if (connection.fromStoryId === connection.toStoryId) throw invalidPlan("it connected a story to itself")
    const from = selectedIds(connection.fromStoryId)
    const to = selectedIds(connection.toStoryId)
    if (connection.fromEvidenceIds.length === 0 || connection.toEvidenceIds.length === 0) {
      throw invalidPlan("it made a connection that is not grounded in evidence on both sides")
    }
    if (!connection.fromEvidenceIds.every((id) => from.has(id)) || !connection.toEvidenceIds.every((id) => to.has(id))) {
      throw invalidPlan("it grounded a connection in evidence that was not selected")
    }
    // The shared named thing must literally appear in the cited evidence of BOTH stories. A connection that is only
    // conceptual ("both are about AI", a plausible trend) has no such word in common and is refused.
    if (!looksNamed(connection.basis)) throw invalidPlan("it based a connection on a general topic rather than a named actor, place, event or fact")
    const basis = comparable(connection.basis)
    const mentions = (storyId: string, evidenceIds: string[]) => {
      const indexed = byId.get(storyId)
      return indexed ? evidenceIds.some((id) => comparable(evidenceTextOf(indexed, id)).includes(basis)) : false
    }
    if (!mentions(connection.fromStoryId, connection.fromEvidenceIds) || !mentions(connection.toStoryId, connection.toEvidenceIds)) {
      throw invalidPlan(`the connection's basis "${connection.basis}" is not stated in the cited evidence of both stories`)
    }
  }

  const totalTargetWords = data.hookTargetWords + data.outroTargetWords + plannedStories.reduce((sum, entry) => sum + entry.targetWords, 0)
  if (totalTargetWords > maxWordsFor(durationMinutes)) {
    throw invalidPlan(`its word budget (${totalTargetWords}) is over the ${maxWordsFor(durationMinutes)}-word ceiling`)
  }

  return {
    title: data.title,
    angle: data.angle,
    openingStoryId: plannedStories[0].storyId,
    endingStoryId: plannedStories[plannedStories.length - 1].storyId,
    stories: plannedStories,
    omitted: data.omitted,
    connections: data.connections,
    hookTargetWords: data.hookTargetWords,
    outroTargetWords: data.outroTargetWords,
    totalTargetWords,
    adjustments,
  }
}

/**
 * researched stories + duration -> LLM -> one validated editorial plan. It decides the episode's content, order
 * and airtime; it writes no prose. Knows nothing about audio or about how the stories were researched.
 */
export async function planEpisode(
  input: PlannerPromptInput,
  { model, modelName, log = scriptLog, clock = () => performance.now() }: PlannerConfig,
): Promise<{ plan: EpisodePlan; durationMs: number; model: string }> {
  const { stories, durationMinutes } = input
  log(`Planning: ${stories.length} researched stories, target ~${targetWordsFor(durationMinutes)} words`)

  const startedAt = clock()
  const raw = await model({ system: buildPlannerSystemPrompt(), user: buildPlannerUserPrompt(input) })
  const durationMs = clock() - startedAt

  const plan = parsePlan(raw, stories.map(({ story }) => indexStory(story)), durationMinutes)
  const roles = plan.stories.map((entry) => `${entry.storyId}:${entry.role}/${entry.targetWords}w`).join(", ")
  log(`Plan: ${plan.stories.length} stories, ${plan.omitted.length} omitted, ${plan.connections.length} connections, ${plan.totalTargetWords} planned words (${roles})`)
  for (const adjustment of plan.adjustments) log(`Plan adjusted: ${adjustment}`)
  log(`Planning took ${(durationMs / 1000).toFixed(1)}s`)
  return { plan, durationMs, model: modelName }
}
