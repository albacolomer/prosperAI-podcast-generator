import { handleReopenSlot } from "../server/schedule/reopen.js"

/**
 * POST /api/reopen-schedule-slot   Body: { "slotDate": "2026-09-21" }
 * Development and testing only (answers 404 in production): makes a delivery slot that failed before any provider was
 * called startable again. It never starts anything itself.
 */
export async function POST(request: Request): Promise<Response> {
  return handleReopenSlot(request)
}
