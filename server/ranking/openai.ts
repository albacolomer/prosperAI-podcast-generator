import OpenAI from "openai"
import { RankingError } from "./errors.js"
import type { RankModel } from "./ranker.js"

export const DEFAULT_RANKING_MODEL = "gpt-5-mini"
const REQUEST_TIMEOUT_MS = 60_000
// Reasoning tokens count against this budget, so leave plenty of room beyond the ~20 short reasons.
const MAX_OUTPUT_TOKENS = 6000

/** JSON schema the Responses API enforces on the model's answer (strict structured output). */
export const RANKING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["selected"],
  properties: {
    selected: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["articleId", "rank", "reason"],
        properties: {
          articleId: { type: "string" },
          rank: { type: "integer" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const

interface OpenAiRankModelConfig {
  apiKey: string
  /** Injectable for tests; defaults to a real client. */
  client?: OpenAI
  modelName?: string
}

/** Maps SDK failures to messages that are safe to return: no keys, prompts or upstream bodies. */
function toRankingError(error: unknown): RankingError {
  if (error instanceof RankingError) return error
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new RankingError("timeout", "The ranking request to OpenAI timed out")
  }
  if (error instanceof OpenAI.APIError && error.status) {
    return new RankingError("upstream", `OpenAI rejected the ranking request (HTTP ${error.status})`)
  }
  return new RankingError("upstream", "The ranking request to OpenAI failed")
}

/** A RankModel backed by OpenAI's Responses API with strict JSON-schema structured output. */
export function createOpenAiRankModel({
  apiKey,
  client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 }),
  modelName = DEFAULT_RANKING_MODEL,
}: OpenAiRankModelConfig): RankModel {
  return async ({ system, user }) => {
    let response
    try {
      response = await client.responses.create({
        model: modelName,
        instructions: system,
        input: user,
        reasoning: { effort: "low" },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        store: false,
        text: {
          format: { type: "json_schema", name: "story_selection", strict: true, schema: RANKING_JSON_SCHEMA },
        },
      })
    } catch (error) {
      throw toRankingError(error)
    }

    if (response.status === "incomplete") {
      throw new RankingError("invalid-output", "The ranking model's answer was cut off before it finished")
    }
    if (!response.output_text) {
      throw new RankingError("invalid-output", "The ranking model returned no answer")
    }
    return response.output_text
  }
}
