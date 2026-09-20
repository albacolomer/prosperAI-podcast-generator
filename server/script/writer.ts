import { z } from "zod"
import type { ScriptSegment } from "../../src/types/script.js"
import type { NewsLogger } from "../news/log.js"
import { countWords } from "../shared/text.js"
import { ScriptError } from "./errors.js"
import { scriptLog } from "./log.js"
import { targetWordsFor } from "./options.js"
import { buildScriptSystemPrompt, buildScriptUserPrompt } from "./prompt.js"
import type { ScriptPromptInput } from "./prompt.js"

export { countWords }

export interface ScriptPrompt {
  system: string
  user: string
  /** Word target for the episode, so the model call can size its output budget. */
  targetWords: number
}

/** Sends the prompt to the LLM and returns its raw structured (JSON) answer. */
export type ScriptModel = (prompt: ScriptPrompt) => Promise<string>

interface WriterConfig {
  model: ScriptModel
  log?: NewsLogger
  clock?: () => number
}

const modelOutputSchema = z.object({
  title: z.string().trim().min(1),
  segments: z
    .array(
      z.object({
        type: z.enum(["hook", "intro", "story", "transition", "outro"]),
        text: z.string().trim().min(1),
        articleIds: z.array(z.string()),
      }),
    )
    .min(1),
})

export interface WrittenScript {
  title: string
  segments: ScriptSegment[]
  /** The complete spoken script: every segment's text, in order. */
  script: string
  wordCount: number
  /** Time spent on the OpenAI call, in milliseconds. */
  durationMs: number
}

function invalidOutput(message: string): ScriptError {
  return new ScriptError("invalid-output", `The script model returned an invalid answer: ${message}`)
}

/** The complete spoken script: every segment's text, in order, as one continuous episode. */
export function reconstructScript(segments: readonly Pick<ScriptSegment, "text">[]): string {
  return segments.map((segment) => segment.text.trim()).join("\n\n")
}

/**
 * Turns the model's raw answer into a script. Only the shape is enforced here: what the script must obey (ids,
 * hook and outro, plan coverage, length, quotes) is judged by the validator, so a script that breaks a rule is
 * returned with its issues instead of being thrown away.
 */
export function parseModelOutput(raw: string): { title: string; segments: ScriptSegment[] } {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw invalidOutput("it was not valid JSON")
  }

  const parsed = modelOutputSchema.safeParse(json)
  if (!parsed.success) throw invalidOutput("it did not match the expected shape")

  return {
    title: parsed.data.title,
    segments: parsed.data.segments.map(({ type, text, articleIds }) => ({ type, text: text.trim(), articleIds })),
  }
}

/**
 * plan + selected evidence + language + tone + duration -> LLM -> one structured episode script. It executes the
 * plan and makes no editorial decisions of its own. Knows nothing about audio or about how the stories were
 * researched. A segment's `articleIds` are the stories' `storyId`s.
 */
export async function writeScript(
  input: ScriptPromptInput,
  { model, log = scriptLog, clock = () => performance.now() }: WriterConfig,
): Promise<WrittenScript> {
  const { language, tone, durationMinutes, plan } = input
  const targetWords = targetWordsFor(durationMinutes)
  log(`Writing: ${plan.stories.length} planned stories, language: ${language}, tone: ${tone}, duration: ${durationMinutes} min (target ~${targetWords} words, plan ${plan.totalTargetWords})`)

  const startedAt = clock()
  const raw = await model({
    system: buildScriptSystemPrompt(tone, language),
    user: buildScriptUserPrompt(input),
    targetWords,
  })
  const durationMs = clock() - startedAt

  const { title, segments } = parseModelOutput(raw)
  const script = reconstructScript(segments)
  const wordCount = countWords(script, language)

  log(`Segments: ${segments.length}, words: ${wordCount} (target ${targetWords})`)
  log(`Writing took ${(durationMs / 1000).toFixed(1)}s`)

  return { title, segments, script, wordCount, durationMs }
}
