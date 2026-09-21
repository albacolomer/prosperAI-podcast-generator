import { readdir } from "node:fs/promises"
import path from "node:path"
import { holdState, tryHold } from "./exclusiveFile.js"
import type { FileHold, HoldState } from "./exclusiveFile.js"
import { defaultScheduleFile } from "./store.js"

/** How often the process running a slot shows it is alive. */
export const CLAIM_HEARTBEAT_MS = 15_000
/** A claim nobody has touched for this long belongs to a process that died (six missed heartbeats). */
export const CLAIM_STALE_MS = 90_000

/** A claim on one delivery day's slot, held by this process until it releases it. */
export type SlotClaim = FileHold

export interface SlotClaims {
  /**
   * Claims the slot of a local day, or returns undefined when another process (or this one) holds a live claim on it.
   * Atomic across processes: of any number of simultaneous callers exactly one gets the claim. A claim left behind by a
   * process that died is taken over.
   */
  tryClaim(slotDate: string): Promise<SlotClaim | undefined>
  /** Whether the slot has no claim, a live one, or one whose holder has stopped showing signs of life. */
  inspect(slotDate: string): Promise<HoldState>
  /** Removes the claims of processes that died, so they never pile up. */
  pruneStale(): Promise<void>
}

/** `claims/2026-09-21.claim`: one file per local day, because a schedule delivers at most one slot a day. */
export function defaultClaimsDir(): string {
  return path.join(path.dirname(defaultScheduleFile()), "claims")
}

const SLOT_DATE = /^\d{4}-\d{2}-\d{2}$/

export function createSlotClaims(dir: string = defaultClaimsDir(), staleMs: number = CLAIM_STALE_MS): SlotClaims {
  const fileFor = (slotDate: string) => {
    if (!SLOT_DATE.test(slotDate)) throw new Error("A slot date looks like 2026-09-21")
    return path.join(dir, `${slotDate}.claim`)
  }

  return {
    async tryClaim(slotDate) {
      return tryHold(fileFor(slotDate), { slotDate }, staleMs)
    },
    async inspect(slotDate) {
      return holdState(fileFor(slotDate), staleMs)
    },
    async pruneStale() {
      let names: string[]
      try {
        names = await readdir(dir)
      } catch {
        return
      }
      for (const name of names.filter((entry) => entry.endsWith(".claim"))) {
        const slotDate = name.slice(0, -".claim".length)
        if (!SLOT_DATE.test(slotDate) || (await holdState(path.join(dir, name), staleMs)) !== "stale") continue
        // Taking it and letting go at once is the atomic way to remove exactly a stale claim.
        await (await tryHold(path.join(dir, name), { slotDate }, staleMs))?.release()
      }
    },
  }
}
