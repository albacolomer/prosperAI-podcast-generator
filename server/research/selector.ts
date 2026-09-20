import { z } from "zod"
import type { ResearchSourceType } from "../../src/types/research.js"
import { ResearchError } from "./errors.js"

export const searchRequestSchema = z.object({
  query: z.string().trim().min(1).max(200),
  topic: z.enum(["news", "general"]),
})

export type SearchRequest = z.infer<typeof searchRequestSchema>

const selectionSchema = z.object({
  selected: z.array(
    z.object({
      candidateId: z.string(),
      type: z.enum(["primary", "reporting", "context"]),
      reason: z.string(),
    }),
  ),
  rejected: z.array(z.object({ candidateId: z.string(), reason: z.string() })),
  followUp: searchRequestSchema.nullable(),
})

export interface SourceSelection {
  selected: { candidateId: string; type: ResearchSourceType; reason: string }[]
  rejected: { candidateId: string; reason: string }[]
  followUp: SearchRequest | null
}

function invalidOutput(message: string): ResearchError {
  return new ResearchError("invalid-output", `The source-selection model returned an invalid answer: ${message}`)
}

/**
 * Turns the model's raw answer into a trusted selection. The model is never trusted: ids must exist in the
 * candidate list, appear once, and stay within the extraction budget.
 */
export function parseSelection(raw: string, candidateIds: ReadonlySet<string>, maxSelect: number): SourceSelection {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw invalidOutput("it was not valid JSON")
  }

  const parsed = selectionSchema.safeParse(json)
  if (!parsed.success) throw invalidOutput("it did not match the expected shape")

  const { selected, rejected, followUp } = parsed.data
  if (selected.length > maxSelect) {
    throw invalidOutput(`it selected ${selected.length} sources but at most ${maxSelect} were allowed`)
  }

  const seen = new Set<string>()
  for (const { candidateId } of [...selected, ...rejected]) {
    if (!candidateIds.has(candidateId)) throw invalidOutput("it referenced a candidate that was not in the list")
    if (seen.has(candidateId)) throw invalidOutput("it listed the same candidate more than once")
    seen.add(candidateId)
  }

  return {
    selected: selected.map(({ candidateId, type, reason }) => ({ candidateId, type, reason: reason.trim() })),
    rejected: rejected.map(({ candidateId, reason }) => ({ candidateId, reason: reason.trim() })),
    followUp,
  }
}
