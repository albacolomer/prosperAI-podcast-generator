import { checkElevenLabsConfig } from "../audio/preflight.js"
import { parseEpisodeRequest } from "../episode/request.js"
import type { EpisodeRequest } from "../episode/request.js"
import { missingEnv } from "../episode/services.js"
import type { ScheduleConfig } from "./types.js"

/**
 * What is wrong with the server's configuration, in words that name the setting and never carry its value: a missing key,
 * an ElevenLabs voice id that is not shaped like one, a model the app does not know. `undefined` when it is fine. This makes
 * no request to any provider: it only looks at the environment (the same checks the manual endpoint makes before it starts).
 */
export function serverConfigProblem(env: NodeJS.ProcessEnv): string | undefined {
  const missing = missingEnv(env)
  if (missing.length === 1) return `${missing[0]} is not set on the server.`
  if (missing.length > 1) return `These settings are not set on the server: ${missing.join(", ")}.`
  const preflight = checkElevenLabsConfig(env)
  return preflight.ok ? undefined : preflight.message
}

export type Runnable = { ok: true; request: EpisodeRequest } | { ok: false; message: string }

/** Whether a scheduled run of this schedule could start: valid episode settings on a correctly configured server. Spends nothing. */
export function checkRunnable(config: ScheduleConfig, env: NodeJS.ProcessEnv): Runnable {
  const problem = serverConfigProblem(env)
  if (problem) return { ok: false, message: problem }
  const parsed = parseEpisodeRequest({ interests: config.interests, language: config.language, tone: config.tone })
  return parsed.ok ? { ok: true, request: parsed.request } : { ok: false, message: `The schedule's settings are not valid: ${parsed.message}.` }
}
