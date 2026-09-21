import { handleGetSchedule, handlePutSchedule } from "../server/schedule/handler.js"

/**
 * GET /api/schedule
 * The saved schedule, when the next episode is due and how the latest scheduled run went. Read-only.
 */
export async function GET(): Promise<Response> {
  return handleGetSchedule()
}

/**
 * PUT /api/schedule
 * Body: { enabled, frequency: "daily" | "weekly" | "monthly", deliveryTime: "HH:MM", weekday, dayOfMonth (1-28), language, tone,
 * interests: string[], timeZone (IANA) }. The server's scheduler then generates an episode ahead of each delivery time, with
 * no browser open. Saving does not start an episode by itself.
 */
export async function PUT(request: Request): Promise<Response> {
  return handlePutSchedule(request)
}
