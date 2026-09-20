import OpenAI from "openai"
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses"
import { ScriptError } from "./errors.js"
import type { PlannerModel } from "./planner.js"
import type { ReviewModel } from "./review.js"
import { REVIEW_ISSUE_TYPES } from "./reviewPrompt.js"
import type { ScriptModel } from "./writer.js"

export const DEFAULT_SCRIPT_MODEL = "gpt-5-mini"
// The planner and the reviewer have their own defaults so that raising the writer's model never raises theirs.
export const DEFAULT_PLANNER_MODEL = "gpt-5-mini"
export const DEFAULT_REVIEW_MODEL = "gpt-5-mini"
// Reasoning tokens count against the output budget, so leave room beyond the script itself. Words
// become more tokens in some languages than others, hence the generous per-word allowance.
const MIN_OUTPUT_TOKENS = 8000
const MAX_OUTPUT_TOKENS = 32_000
const TOKENS_PER_WORD = 2.5
const REASONING_ALLOWANCE_TOKENS = 5000
// Long episodes take minutes to write, so the request timeout grows with the script.
const BASE_TIMEOUT_MS = 60_000
const TIMEOUT_MS_PER_WORD = 25
const MAX_TIMEOUT_MS = 300_000
// The plan and the review are small answers, but they read the whole research file and reason about it.
const PLAN_MAX_OUTPUT_TOKENS = 12_000
const PLAN_TIMEOUT_MS = 120_000
const REVIEW_MAX_OUTPUT_TOKENS = 16_000
const REVIEW_TIMEOUT_MS = 180_000

const idList = { type: "array", items: { type: "string" } } as const

/** JSON schema the Responses API enforces on the episode plan (strict structured output). */
export const PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "angle", "stories", "omitted", "connections", "hookTargetWords", "outroTargetWords"],
  properties: {
    title: { type: "string" },
    angle: { type: "string" },
    stories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "storyId",
          "role",
          "targetWords",
          "selectedFactIds",
          "selectedContextIds",
          "selectedAnalysisIds",
          "selectedQuoteIds",
          "selectedDisagreementIds",
          "reason",
        ],
        properties: {
          storyId: { type: "string" },
          role: { type: "string", enum: ["main", "supporting"] },
          targetWords: { type: "integer" },
          selectedFactIds: idList,
          selectedContextIds: idList,
          selectedAnalysisIds: idList,
          selectedQuoteIds: idList,
          selectedDisagreementIds: idList,
          reason: { type: "string" },
        },
      },
    },
    omitted: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["storyId", "reason"],
        properties: { storyId: { type: "string" }, reason: { type: "string" } },
      },
    },
    connections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fromStoryId", "toStoryId", "basisType", "basis", "idea", "fromEvidenceIds", "toEvidenceIds"],
        properties: {
          fromStoryId: { type: "string" },
          toStoryId: { type: "string" },
          basisType: { type: "string", enum: ["shared-actor", "same-entity-or-event", "same-location", "same-fact", "stated-by-source"] },
          basis: { type: "string" },
          idea: { type: "string" },
          fromEvidenceIds: idList,
          toEvidenceIds: idList,
        },
      },
    },
    hookTargetWords: { type: "integer" },
    outroTargetWords: { type: "integer" },
  },
} as const

/** JSON schema the Responses API enforces on the script (strict structured output). */
export const SCRIPT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "segments"],
  properties: {
    title: { type: "string" },
    segments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "text", "articleIds"],
        properties: {
          type: { type: "string", enum: ["hook", "intro", "story", "transition", "outro"] },
          text: { type: "string" },
          articleIds: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const

/** JSON schema the Responses API enforces on the script review (strict structured output). */
export const REVIEW_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["issues"],
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "severity", "message", "segmentIndex", "excerpt", "evidenceIds"],
        properties: {
          type: { type: "string", enum: [...REVIEW_ISSUE_TYPES] },
          severity: { type: "string", enum: ["error", "warning"] },
          message: { type: "string" },
          segmentIndex: { type: ["integer", "null"] },
          excerpt: { type: ["string", "null"] },
          evidenceIds: idList,
        },
      },
    },
  },
} as const

interface OpenAiModelConfig {
  apiKey: string
  /** Injectable for tests; defaults to a real client. */
  client?: OpenAI
  modelName?: string
}

export function outputTokensFor(targetWords: number): number {
  const tokens = Math.round(targetWords * TOKENS_PER_WORD) + REASONING_ALLOWANCE_TOKENS
  return Math.min(MAX_OUTPUT_TOKENS, Math.max(MIN_OUTPUT_TOKENS, tokens))
}

export function timeoutMsFor(targetWords: number): number {
  return Math.min(MAX_TIMEOUT_MS, BASE_TIMEOUT_MS + targetWords * TIMEOUT_MS_PER_WORD)
}

/** Maps SDK failures to messages that are safe to return: no keys, prompts or upstream bodies. */
function toScriptError(error: unknown, what: string): ScriptError {
  if (error instanceof ScriptError) return error
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new ScriptError("timeout", `The ${what} request to OpenAI timed out`)
  }
  if (error instanceof OpenAI.APIError && error.status) {
    return new ScriptError("upstream", `OpenAI rejected the ${what} request (HTTP ${error.status})`)
  }
  return new ScriptError("upstream", `The ${what} request to OpenAI failed`)
}

interface JsonCall {
  what: string
  name: string
  schema: Record<string, unknown>
  effort: "low" | "medium"
  maxOutputTokens: number
  timeoutMs: number
}

/** One strict JSON-schema call to the Responses API. Returns the raw JSON text, or a safe ScriptError. */
async function callJson(
  client: OpenAI,
  modelName: string,
  { system, user }: { system: string; user: string },
  { what, name, schema, effort, maxOutputTokens, timeoutMs }: JsonCall,
): Promise<string> {
  const params: ResponseCreateParamsNonStreaming = {
    model: modelName,
    instructions: system,
    input: user,
    reasoning: { effort },
    max_output_tokens: maxOutputTokens,
    store: false,
    text: { format: { type: "json_schema", name, strict: true, schema } },
  }

  let response
  try {
    response = await client.responses.create(params, { timeout: timeoutMs })
  } catch (error) {
    throw toScriptError(error, what)
  }

  if (response.status === "incomplete") {
    throw new ScriptError("invalid-output", `The ${what} model's answer was cut off before it finished`)
  }
  if (!response.output_text) {
    throw new ScriptError("invalid-output", `The ${what} model returned no answer`)
  }
  return response.output_text
}

/** A ScriptModel backed by OpenAI's Responses API with strict JSON-schema structured output. */
export function createOpenAiScriptModel({
  apiKey,
  client = new OpenAI({ apiKey, maxRetries: 1 }),
  modelName = DEFAULT_SCRIPT_MODEL,
}: OpenAiModelConfig): ScriptModel {
  return ({ system, user, targetWords }) =>
    callJson(client, modelName, { system, user }, {
      what: "script",
      name: "podcast_script",
      schema: SCRIPT_JSON_SCHEMA,
      effort: "medium",
      maxOutputTokens: outputTokensFor(targetWords),
      timeoutMs: timeoutMsFor(targetWords),
    })
}

/** A PlannerModel backed by the Responses API: editorial planning is judgement, but light on reasoning. */
export function createOpenAiPlannerModel({
  apiKey,
  client = new OpenAI({ apiKey, maxRetries: 1 }),
  modelName = DEFAULT_PLANNER_MODEL,
}: OpenAiModelConfig): PlannerModel {
  return (prompt) =>
    callJson(client, modelName, prompt, {
      what: "planning",
      name: "episode_plan",
      schema: PLAN_JSON_SCHEMA,
      effort: "low",
      maxOutputTokens: PLAN_MAX_OUTPUT_TOKENS,
      timeoutMs: PLAN_TIMEOUT_MS,
    })
}

/** A ReviewModel backed by the Responses API: fact-checking gets more reasoning than writing does. */
export function createOpenAiReviewModel({
  apiKey,
  client = new OpenAI({ apiKey, maxRetries: 1 }),
  modelName = DEFAULT_REVIEW_MODEL,
}: OpenAiModelConfig): ReviewModel {
  return (prompt) =>
    callJson(client, modelName, prompt, {
      what: "review",
      name: "script_review",
      schema: REVIEW_JSON_SCHEMA,
      effort: "medium",
      maxOutputTokens: REVIEW_MAX_OUTPUT_TOKENS,
      timeoutMs: REVIEW_TIMEOUT_MS,
    })
}
