import { scheduleSettingsSchema } from "./types.js"
import type { ScheduleSettings } from "./types.js"

export type ParsedScheduleRequest = { ok: true; settings: ScheduleSettings } | { ok: false; message: string }

/** Validates the JSON body of PUT /api/schedule. */
export function parseScheduleRequest(body: unknown): ParsedScheduleRequest {
  const parsed = scheduleSettingsSchema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ") }
  }
  return { ok: true, settings: parsed.data }
}
