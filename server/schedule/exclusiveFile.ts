import { randomBytes } from "node:crypto"
import { mkdir, open, readFile, stat, unlink, utimes } from "node:fs/promises"
import path from "node:path"

/**
 * A file that only one process can hold at a time. Creating it with the "wx" flag is atomic across processes on the same
 * disk (exactly one creator wins, the rest are refused), which is all the coordination the scheduler needs: no server, no
 * database. The holder keeps the file's modification time fresh (`touch`); a file nobody has touched for `staleMs` belongs
 * to a process that died, and can be taken over.
 */
export interface FileHold {
  readonly file: string
  /** Marks the hold as alive. Resolves false when the file is no longer ours (someone took it over as stale). */
  touch(): Promise<boolean>
  /** Gives the hold up. Only removes the file if it still is ours, so it can never delete someone else's. */
  release(): Promise<void>
}

export type HoldState = "none" | "live" | "stale"

const codeOf = (error: unknown) => (error as NodeJS.ErrnoException).code
const isMissing = (error: unknown) => codeOf(error) === "ENOENT"
/** On Windows a file that is being deleted (or briefly held by a scanner) answers EPERM/EACCES/EBUSY instead of "exists" or "missing". */
const isBusy = (error: unknown) => ["EPERM", "EACCES", "EBUSY"].includes(codeOf(error) ?? "")

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** How old a hold's last touch is, in ms; `undefined` when there is no such file. */
async function ageOf(file: string): Promise<number | undefined> {
  try {
    return Date.now() - (await stat(file)).mtimeMs
  } catch (error) {
    if (isMissing(error)) return undefined
    if (isBusy(error)) return 0 // in the middle of being replaced: certainly not stale
    throw error
  }
}

export async function holdState(file: string, staleMs: number): Promise<HoldState> {
  const age = await ageOf(file)
  if (age === undefined) return "none"
  return age > staleMs ? "stale" : "live"
}

async function ownedBy(file: string, token: string): Promise<boolean> {
  try {
    return (JSON.parse(await readFile(file, "utf8")) as { token?: unknown }).token === token
  } catch {
    return false
  }
}

/** Removes a file, waiting out the short spells in which Windows refuses; a file that is already gone is fine. */
async function removeFile(file: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await unlink(file)
      return
    } catch (error) {
      if (isMissing(error)) return
      if (!isBusy(error) || attempt >= 6) throw error
      await sleep(10 * attempt)
    }
  }
}

type Created = { hold: FileHold } | "exists" | "busy"

async function create(file: string, payload: Record<string, unknown>, token: string): Promise<Created> {
  let handle
  try {
    handle = await open(file, "wx")
  } catch (error) {
    const code = codeOf(error)
    if (code === "EEXIST") return "exists"
    if (isBusy(error)) return "busy"
    throw error
  }
  try {
    await handle.writeFile(JSON.stringify({ ...payload, token, pid: process.pid, heldAt: new Date().toISOString() }))
  } finally {
    await handle.close()
  }
  return {
    hold: {
      file,
      async touch() {
        if (!(await ownedBy(file, token))) return false
        const now = new Date()
        try {
          await utimes(file, now, now)
          return true
        } catch (error) {
          if (isMissing(error)) return false
          throw error
        }
      },
      async release() {
        if (await ownedBy(file, token)) await removeFile(file)
      },
    },
  }
}

/** A takeover lock older than this was left by a process that died mid-takeover. Takeovers take milliseconds. */
const TAKEOVER_STALE_MS = 10_000

/**
 * Takes the file, or returns undefined when another process holds it and is alive (or is taking it over at this moment).
 *
 * A hold that has gone stale is replaced under a small takeover lock, so that only one process at a time can do it: the
 * staleness is checked again under the lock, the stale file is removed, and the new one is created with the same atomic
 * "wx". A process that saw the hold as stale but arrives after another has replaced it finds it fresh and backs off, so a
 * live holder is never displaced and no two processes ever hold it together.
 */
export async function tryHold(file: string, payload: Record<string, unknown>, staleMs: number): Promise<FileHold | undefined> {
  await mkdir(path.dirname(file), { recursive: true })
  const token = randomBytes(8).toString("hex")

  for (let attempt = 0; attempt < 6; attempt++) {
    const created = await create(file, payload, token)
    if (typeof created === "object") return created.hold
    if (created === "busy") {
      await sleep(10 * (attempt + 1))
      continue
    }
    if ((await holdState(file, staleMs)) !== "stale") return undefined

    const takeover = await create(`${file}.takeover`, {}, token)
    if (typeof takeover !== "object") {
      // Someone else is taking it over right now. (A takeover lock that outlived its process is cleared, and we try again.)
      if ((await holdState(`${file}.takeover`, TAKEOVER_STALE_MS)) === "stale") await removeFile(`${file}.takeover`)
      return undefined
    }
    try {
      if ((await holdState(file, staleMs)) === "live") return undefined
      await removeFile(file)
    } finally {
      await takeover.hold.release()
    }
    // The name is free. Creating it is still the atomic step: if another process slips in first, it holds it and we back off.
  }
  return undefined
}

/** Runs `work` holding a short-lived lock file, waiting for other processes to finish theirs. For read-modify-write of a shared file. */
export async function withFileLock<T>(file: string, work: () => Promise<T>, { staleMs = 10_000, timeoutMs = 15_000 } = {}): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const hold = await tryHold(file, {}, staleMs)
    if (hold) {
      try {
        return await work()
      } finally {
        await hold.release()
      }
    }
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${path.basename(file)}`)
    await sleep(15 + Math.random() * 35)
  }
}
