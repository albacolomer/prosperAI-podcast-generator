import { z } from "zod"
import type { ValidationIssue } from "../../src/types/validation.js"
import { normalizeForQuoteMatch } from "../shared/text.js"
import { ScriptError } from "./errors.js"
import { evidenceIdsOf, splitQualifiedId } from "./evidence.js"
import type { IndexedStory } from "./evidence.js"
import { buildReviewSystemPrompt, buildReviewUserPrompt, ERROR_TYPES, REVIEW_ISSUE_TYPES } from "./reviewPrompt.js"
import type { ReviewPromptInput } from "./reviewPrompt.js"

export interface ReviewPrompt {
  system: string
  user: string
}

/** Sends the prompt to the LLM and returns its raw structured (JSON) answer. */
export type ReviewModel = (prompt: ReviewPrompt) => Promise<string>

const reviewSchema = z.object({
  issues: z.array(
    z.object({
      type: z.enum(REVIEW_ISSUE_TYPES),
      severity: z.enum(["error", "warning"]),
      message: z.string().trim().min(1),
      segmentIndex: z.number().int().nullable(),
      excerpt: z.string().nullable(),
      evidenceIds: z.array(z.string()),
    }),
  ),
})

const ERROR_ELIGIBLE = new Set<string>(ERROR_TYPES)

function invalidReview(message: string): ScriptError {
  return new ScriptError("invalid-output", `The script reviewer returned an invalid answer: ${message}`)
}

/** Whether `excerpt` really occurs in the script (in the given 1-based segment, or anywhere when there is none). */
function occursIn(excerpt: string, segmentTexts: readonly string[], segmentIndex: number | undefined): boolean {
  const wanted = normalizeForQuoteMatch(excerpt)
  if (!wanted) return false
  const texts = segmentIndex === undefined ? segmentTexts : [segmentTexts[segmentIndex - 1] ?? ""]
  return texts.some((text) => normalizeForQuoteMatch(text).includes(wanted))
}

/**
 * Turns the reviewer's raw answer into validation issues. The reviewer is never trusted with the gate:
 * - only evidence categories can be errors; every other category is forced to a warning;
 * - an error must quote words that really occur in the script, otherwise it is kept as a warning (the reviewer
 *   did not show what is wrong, so the gate must not block on it);
 * - evidence ids that do not exist are dropped, and a segment index outside the script is dropped.
 */
export function parseReview(raw: string, segmentTexts: readonly string[], stories: readonly IndexedStory[]): ValidationIssue[] {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw invalidReview("it was not valid JSON")
  }
  const parsed = reviewSchema.safeParse(json)
  if (!parsed.success) throw invalidReview("it did not match the expected shape")

  const known = new Map(stories.map((indexed) => [indexed.story.storyId, evidenceIdsOf(indexed)]))

  return parsed.data.issues.map((issue): ValidationIssue => {
    const segmentIndex = issue.segmentIndex !== null && issue.segmentIndex >= 1 && issue.segmentIndex <= segmentTexts.length ? issue.segmentIndex : undefined
    const excerpt = issue.excerpt?.trim() || undefined
    const evidenceIds = issue.evidenceIds.filter((value) => {
      const parts = splitQualifiedId(value)
      return parts !== null && known.get(parts.storyId)?.has(parts.itemId) === true
    })

    let severity = issue.severity
    let note = ""
    if (severity === "error" && !ERROR_ELIGIBLE.has(issue.type)) {
      severity = "warning"
      note = " (kept as a warning: not an evidence problem)"
    } else if (severity === "error" && (!excerpt || !occursIn(excerpt, segmentTexts, segmentIndex))) {
      severity = "warning"
      note = " (kept as a warning: the reviewer did not quote script text that could be verified)"
    }

    return {
      source: "ai",
      type: issue.type,
      severity,
      message: `${issue.message}${note}`,
      ...(segmentIndex !== undefined ? { segmentIndex } : {}),
      ...(excerpt ? { excerpt } : {}),
      ...(evidenceIds.length > 0 ? { evidenceIds } : {}),
    }
  })
}

/** script + plan + full research -> LLM -> structured issues. It reports; it never rewrites the script. */
export async function reviewScript(
  input: ReviewPromptInput,
  model: ReviewModel,
): Promise<ValidationIssue[]> {
  const raw = await model({ system: buildReviewSystemPrompt(), user: buildReviewUserPrompt(input) })
  return parseReview(raw, input.segments.map((segment) => segment.text), input.stories)
}
