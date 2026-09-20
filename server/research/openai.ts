import OpenAI from "openai"
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses"
import { ResearchError } from "./errors.js"
import { researchLog } from "./log.js"
import type { ResearchModel } from "./researcher.js"

export const DEFAULT_RESEARCH_MODEL = "gpt-5-mini"
const SELECT_TIMEOUT_MS = 60_000
const SYNTHESIZE_TIMEOUT_MS = 120_000
// Reasoning tokens count against these budgets, so leave room beyond the visible answer.
const SELECT_MAX_OUTPUT_TOKENS = 6000
const SYNTHESIZE_MAX_OUTPUT_TOKENS = 16_000

const searchRequestSchema = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["query", "topic"],
      properties: { query: { type: "string" }, topic: { type: "string", enum: ["news", "general"] } },
    },
    { type: "null" },
  ],
} as const

const claimSchema = {
  type: "object",
  additionalProperties: false,
  required: ["claim", "sourceIds"],
  properties: { claim: { type: "string" }, sourceIds: { type: "array", items: { type: "string" } } },
} as const

/** JSON schema the Responses API enforces on the source-selection answer (strict structured output). */
export const SELECTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["selected", "rejected", "followUp"],
  properties: {
    selected: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidateId", "type", "reason"],
        properties: {
          candidateId: { type: "string" },
          type: { type: "string", enum: ["primary", "reporting", "context"] },
          reason: { type: "string" },
        },
      },
    },
    rejected: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidateId", "reason"],
        properties: { candidateId: { type: "string" }, reason: { type: "string" } },
      },
    },
    followUp: searchRequestSchema,
  },
} as const

/** JSON schema the Responses API enforces on the synthesis answer (strict structured output). */
export const SYNTHESIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "assessment",
    "assessmentReason",
    "summary",
    "facts",
    "context",
    "analysis",
    "quotes",
    "disagreements",
    "resolutions",
    "resolutionQuery",
  ],
  properties: {
    assessment: { type: "string", enum: ["sufficient", "insufficient"] },
    assessmentReason: { type: "string" },
    summary: { type: "string" },
    facts: { type: "array", items: claimSchema },
    context: { type: "array", items: claimSchema },
    analysis: { type: "array", items: claimSchema },
    quotes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "speaker", "sourceId"],
        properties: { text: { type: "string" }, speaker: { type: "string" }, sourceId: { type: "string" } },
      },
    },
    disagreements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["priorId", "topic", "positions"],
        properties: {
          priorId: { type: ["string", "null"] },
          topic: { type: "string" },
          positions: { type: "array", items: claimSchema },
        },
      },
    },
    resolutions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["disagreementId", "resolution", "sourceIds"],
        properties: {
          disagreementId: { type: "string" },
          resolution: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    resolutionQuery: searchRequestSchema,
  },
} as const

interface OpenAiResearchModelConfig {
  apiKey: string
  /** Injectable for tests; defaults to a real client. */
  client?: OpenAI
  modelName?: string
}

/** Maps SDK failures to messages that are safe to return: no keys, prompts, page content or upstream bodies. */
function toResearchError(error: unknown): ResearchError {
  if (error instanceof ResearchError) return error
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new ResearchError("timeout", "The research request to OpenAI timed out")
  }
  if (error instanceof OpenAI.APIError && error.status) {
    return new ResearchError("upstream", `OpenAI rejected the research request (HTTP ${error.status})`)
  }
  // Development only, and only the error class and network code: never the message, which can echo a key or prompt.
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code
  researchLog(`OpenAI call failed: ${error instanceof Error ? error.name : typeof error}${typeof code === "string" ? ` (${code})` : ""}`)
  return new ResearchError("upstream", "The research request to OpenAI failed")
}

/** A ResearchModel backed by OpenAI's Responses API with strict JSON-schema structured output. */
export function createOpenAiResearchModel({
  apiKey,
  client = new OpenAI({ apiKey, maxRetries: 1 }),
  modelName = DEFAULT_RESEARCH_MODEL,
}: OpenAiResearchModelConfig): ResearchModel {
  async function call(
    { system, user }: { system: string; user: string },
    options: {
      name: string
      schema: Record<string, unknown>
      effort: "low" | "medium"
      maxOutputTokens: number
      timeoutMs: number
    },
  ): Promise<string> {
    const params: ResponseCreateParamsNonStreaming = {
      model: modelName,
      instructions: system,
      input: user,
      reasoning: { effort: options.effort },
      max_output_tokens: options.maxOutputTokens,
      store: false,
      text: { format: { type: "json_schema", name: options.name, strict: true, schema: options.schema } },
    }

    let response
    try {
      response = await client.responses.create(params, { timeout: options.timeoutMs })
    } catch (error) {
      throw toResearchError(error)
    }

    if (response.status === "incomplete") {
      throw new ResearchError("invalid-output", "The research model's answer was cut off before it finished")
    }
    if (!response.output_text) {
      throw new ResearchError("invalid-output", "The research model returned no answer")
    }
    return response.output_text
  }

  return {
    select: (prompt) =>
      call(prompt, {
        name: "source_selection",
        schema: SELECTION_JSON_SCHEMA,
        effort: "low",
        maxOutputTokens: SELECT_MAX_OUTPUT_TOKENS,
        timeoutMs: SELECT_TIMEOUT_MS,
      }),
    // The conservative, evidence-checking step gets more reasoning than picking sources does.
    synthesize: (prompt) =>
      call(prompt, {
        name: "story_research",
        schema: SYNTHESIS_JSON_SCHEMA,
        effort: "medium",
        maxOutputTokens: SYNTHESIZE_MAX_OUTPUT_TOKENS,
        timeoutMs: SYNTHESIZE_TIMEOUT_MS,
      }),
  }
}
