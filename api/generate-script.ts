import { generateEpisode } from "../server/script/episode.js"
import { ScriptError, statusForScriptError } from "../server/script/errors.js"
import {
  createOpenAiPlannerModel,
  createOpenAiReviewModel,
  createOpenAiScriptModel,
  DEFAULT_PLANNER_MODEL,
  DEFAULT_REVIEW_MODEL,
  DEFAULT_SCRIPT_MODEL,
} from "../server/script/openai.js"
import { parseScriptRequest } from "../server/script/request.js"

const MAX_BODY_CHARS = 1_000_000

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

/**
 * POST /api/generate-script
 * Body: { interests: string[], language: string, durationMinutes: number, tone: string,
 *         stories: { rank: number, story: EnrichedStory }[] }
 * Produces one podcast episode from researched stories: an Episode Planner decides what to tell, the Script Writer
 * executes that plan, and the Script Validator checks the result (deterministic rules plus an AI review against
 * the research). Only stories Research marked "enriched" are accepted. The response is the script plus the plan
 * and the validation result; a failed validation is reported (validation.passed === false), not repaired.
 * The OpenAI key stays here.
 */
export async function POST(request: Request): Promise<Response> {
  const text = await request.text()
  if (text.length > MAX_BODY_CHARS) return json({ error: "Request body is too large" }, 413)

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400)
  }

  const parsed = parseScriptRequest(body)
  if (!parsed.ok) return json({ error: parsed.message }, 400)

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set; the script endpoint cannot call OpenAI.")
    return json({ error: "Script generation is not configured" }, 503)
  }

  // Each stage has its own model setting and default: changing the writer's model never changes the planner's or the reviewer's.
  const scriptModel = process.env.OPENAI_SCRIPT_MODEL || DEFAULT_SCRIPT_MODEL
  const plannerModel = process.env.OPENAI_PLANNER_MODEL || DEFAULT_PLANNER_MODEL
  const reviewModel = process.env.OPENAI_VALIDATOR_MODEL || DEFAULT_REVIEW_MODEL
  try {
    const result = await generateEpisode(parsed.request, {
      planner: { model: createOpenAiPlannerModel({ apiKey, modelName: plannerModel }), modelName: plannerModel },
      writer: { model: createOpenAiScriptModel({ apiKey, modelName: scriptModel }), modelName: scriptModel },
      reviewer: { model: createOpenAiReviewModel({ apiKey, modelName: reviewModel }), modelName: reviewModel },
    })
    return json(result)
  } catch (error) {
    if (error instanceof ScriptError) {
      console.error(`[Script] ${error.kind}: ${error.message}`)
      return json({ error: error.message }, statusForScriptError(error))
    }
    console.error("[Script] Unexpected failure", error instanceof Error ? error.name : "unknown error")
    return json({ error: "Unexpected error while generating the script" }, 500)
  }
}
