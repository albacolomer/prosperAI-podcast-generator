import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { defaultScheduleFile } from "./store.js"

/** A scheduler instance that has not refreshed its file for this long has stopped (it beats every tick, 30 s apart). */
export const INSTANCE_STALE_MS = 90_000

export interface SchedulerInstance {
  pid: number
  port?: number
  startedAt: string
}

/** Where the dev servers on this project note that they are running a scheduler. Only for the warning: it protects nothing. */
export function defaultInstancesDir(): string {
  return path.join(path.dirname(defaultScheduleFile()), "schedulers")
}

/** Whether a process with this id exists. (EPERM means it exists but is not ours.) */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

const startedAt = new Date().toISOString()

/** Notes that this process is running a scheduler, and refreshes the note. Call it on every tick. */
export async function beatInstance(port?: number, dir: string = defaultInstancesDir(), pid: number = process.pid): Promise<void> {
  await mkdir(dir, { recursive: true })
  const info: SchedulerInstance = { pid, port, startedAt }
  await writeFile(path.join(dir, `${pid}.json`), JSON.stringify(info))
}

/** Removes this process's note (on shutdown). */
export async function forgetInstance(dir: string = defaultInstancesDir(), pid: number = process.pid): Promise<void> {
  await unlink(path.join(dir, `${pid}.json`)).catch(() => undefined)
}

/**
 * The other processes that are running a scheduler against this project right now: a note that is recent and whose process
 * still exists. Notes left by processes that are gone are cleared. Development-time information only: two schedulers do
 * no harm (the slot claim sees to that), but the person running them should know.
 */
export async function otherInstances(
  dir: string = defaultInstancesDir(),
  ownPid: number = process.pid,
  alive: (pid: number) => boolean = isProcessAlive,
  staleMs: number = INSTANCE_STALE_MS,
): Promise<SchedulerInstance[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const found: SchedulerInstance[] = []
  for (const name of names.filter((entry) => entry.endsWith(".json"))) {
    const file = path.join(dir, name)
    try {
      const info = JSON.parse(await readFile(file, "utf8")) as SchedulerInstance
      if (typeof info.pid !== "number" || info.pid === ownPid) continue
      const { mtimeMs } = await stat(file)
      if (Date.now() - mtimeMs > staleMs || !alive(info.pid)) {
        await unlink(file).catch(() => undefined)
        continue
      }
      found.push(info)
    } catch {
      // Half-written or unreadable: skipped this time, read again on the next.
    }
  }
  return found
}
