import type { ScriptValidation, ValidationIssue } from "../../src/types/validation.js"
import type { NewsLogger } from "../news/log.js"
import { runChecks } from "./checks.js"
import type { CheckInput } from "./checks.js"
import { scriptLog } from "./log.js"
import { maxWordsFor, minWordsFor, targetWordsFor } from "./options.js"
import type { ToneId } from "./options.js"
import { reviewScript } from "./review.js"
import type { ReviewModel } from "./review.js"

export interface ValidatorInput extends CheckInput {
  tone: ToneId
}

interface ValidatorConfig {
  reviewModel: ReviewModel
  log?: NewsLogger
  clock?: () => number
}

/**
 * The quality gate between the writer and the voice: exact checks first, then an AI review against the research.
 * It reports and never edits the script. `passed` means "no error": warnings (style, repetition, tone, weak
 * transitions, editorial suggestions) never block. If the AI review cannot run, the deterministic result still
 * stands and the review is reported as unavailable with a warning, so a missing review is visible, not silent.
 */
export async function validateScript(
  input: ValidatorInput,
  { reviewModel, log = scriptLog, clock = () => performance.now() }: ValidatorConfig,
): Promise<{ validation: ScriptValidation; durationMs: number }> {
  const checked = runChecks(input)
  const issues: ValidationIssue[] = [...checked.issues]

  const startedAt = clock()
  let aiReview: ScriptValidation["stats"]["aiReview"]
  try {
    const found = await reviewScript(input, reviewModel)
    issues.push(...found)
    aiReview = found.length === 0 ? "passed" : "issues"
  } catch (error) {
    aiReview = "unavailable"
    log(`AI review failed: ${error instanceof Error ? error.name : "unknown error"}`)
    issues.push({
      source: "ai",
      type: "review-unavailable",
      severity: "warning",
      message: `The AI evidence review could not run (${error instanceof Error ? error.message : "unknown error"}); only the deterministic checks were applied.`,
    })
  }
  const durationMs = clock() - startedAt

  const errors = issues.filter((issue) => issue.severity === "error").length
  const validation: ScriptValidation = {
    passed: errors === 0,
    issues,
    stats: {
      wordCount: checked.wordCount,
      targetWords: targetWordsFor(input.durationMinutes),
      maxWords: maxWordsFor(input.durationMinutes),
      minWords: minWordsFor(input.durationMinutes),
      storiesPlanned: input.plan.stories.length,
      storiesCovered: checked.storiesCovered,
      quotesUsed: checked.quotesUsed,
      errors,
      warnings: issues.length - errors,
      aiReview,
    },
  }
  log(`Validation: ${validation.passed ? "PASSED" : "FAILED"} (${errors} errors, ${validation.stats.warnings} warnings, AI review ${aiReview}) in ${(durationMs / 1000).toFixed(1)}s`)
  return { validation, durationMs }
}
