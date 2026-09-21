import { randomBytes } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { defaultStorageDir } from "../episode/storage.js"
import { withFileLock } from "./exclusiveFile.js"
import { EMPTY_SCHEDULE_FILE, scheduleFileSchema } from "./types.js"
import type { ScheduleFile } from "./types.js"

/** Beside the episodes (never inside the listing the audio endpoint reads, which only looks at `<id>.mp3`). */
export function defaultScheduleFile(): string {
  return path.join(defaultStorageDir(), "schedule.json")
}

export interface ScheduleStore {
  read(): Promise<ScheduleFile>
  /**
   * Applies `change` to the saved file and writes the result. Updates run one at a time, in this process (a queue) and across
   * processes (a lock file), so two of them can never overwrite each other, and the write is atomic: the file is either the
   * old version or the new one, also after a crash.
   */
  update(change: (current: ScheduleFile) => ScheduleFile): Promise<ScheduleFile>
}

// The dev server re-evaluates modules when they are edited, so the queue that serializes updates lives outside this module.
const queues = ((globalThis as { __prosperpodScheduleQueues?: Map<string, Promise<unknown>> }).__prosperpodScheduleQueues ??= new Map())

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Windows can refuse a rename for a moment while a virus scanner or an indexer holds the target. */
async function replaceFile(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (attempt >= 5 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw error
      await sleep(20 * attempt)
    }
  }
}

export function createScheduleStore(file: string = defaultScheduleFile()): ScheduleStore {
  async function load(): Promise<ScheduleFile> {
    let text: string
    try {
      text = await readFile(file, "utf8")
    } catch {
      return EMPTY_SCHEDULE_FILE
    }
    try {
      const parsed = scheduleFileSchema.safeParse(JSON.parse(text))
      if (parsed.success) return parsed.data
    } catch {
      // Not JSON: treated like an unreadable file below.
    }
    console.error("[Schedule] schedule.json could not be read; starting from an empty schedule")
    return EMPTY_SCHEDULE_FILE
  }

  async function write(value: ScheduleFile): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true })
    const temporary = `${file}.${randomBytes(4).toString("hex")}.tmp`
    await writeFile(temporary, JSON.stringify(value, null, 2))
    await replaceFile(temporary, file)
  }

  return {
    read: load,
    update(change) {
      const previous = queues.get(file) ?? Promise.resolve()
      const next = previous
        .catch(() => undefined)
        .then(() =>
          // Another dev server on the same project may be updating the file at this very moment: it holds the lock while it does.
          withFileLock(`${file}.lock`, async () => {
            const updated = scheduleFileSchema.parse(change(await load()))
            await write(updated)
            return updated
          }),
        )
      queues.set(file, next)
      return next
    },
  }
}
