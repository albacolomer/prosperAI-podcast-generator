export type LockOwner = "manual" | "scheduled"

/** Who is generating an episode right now. Only one pipeline runs at a time, because each run spends news, OpenAI, Tavily and ElevenLabs credits. */
export interface GenerationLock {
  /** Takes the lock, or returns undefined when someone else holds it. The returned function releases it (once). */
  tryAcquire(owner: LockOwner): (() => void) | undefined
  owner(): LockOwner | undefined
}

export function createGenerationLock(): GenerationLock {
  let holder: { owner: LockOwner } | undefined
  return {
    tryAcquire(owner) {
      if (holder) return undefined
      const mine = { owner }
      holder = mine
      return () => {
        if (holder === mine) holder = undefined
      }
    },
    owner: () => holder?.owner,
  }
}

/**
 * The lock the manual endpoint and the scheduler share. It lives on globalThis because the dev server re-evaluates this
 * module whenever a file is edited, and a run that is still going must keep holding the same lock.
 */
export const generationLock: GenerationLock = ((globalThis as { __prosperpodGenerationLock?: GenerationLock }).__prosperpodGenerationLock ??=
  createGenerationLock())
