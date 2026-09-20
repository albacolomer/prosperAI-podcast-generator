import { randomBytes } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ScriptResponse } from "../../src/types/script.js"
import type { ValidationIssue } from "../../src/types/validation.js"

/** `<slug>-<8 hex>`: lowercase words joined by hyphens, so an id can never contain a path separator. */
const EPISODE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_ID_LENGTH = 100
const MAX_SLUG_LENGTH = 60
const SUFFIX_PATTERN = /-[0-9a-f]{8}$/

export function isEpisodeId(value: string): boolean {
  return value.length <= MAX_ID_LENGTH && EPISODE_ID_PATTERN.test(value)
}

export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "")
  return slug || "episode"
}

/** The filename a downloaded episode gets, from its id: `prosperpod-<title-slug>.mp3`. */
export function downloadFilename(id: string): string {
  return `prosperpod-${id.replace(SUFFIX_PATTERN, "")}.mp3`
}

/**
 * Where generated MP3s live. Local development keeps them under .generated/ in the project. A serverless host has no
 * durable disk, so there they go to the instance's temp directory: they last as long as that instance does.
 */
export function defaultStorageDir(): string {
  if (process.env.EPISODE_STORAGE_DIR) return process.env.EPISODE_STORAGE_DIR
  if (process.env.VERCEL) return path.join(tmpdir(), "prosperpod-episodes")
  return path.join(process.cwd(), ".generated", "episodes")
}

/** A script that did not pass validation, kept for inspection: what was written, what was wrong with it and what the writer was told. */
export interface FailedScriptRecord {
  attempt: number
  maxAttempts: number
  /** The blocking issues the writer was given for this attempt (empty for the first). */
  feedback: readonly ValidationIssue[]
  script: ScriptResponse
}

/** Where failed scripts go, inside the episode directory (the audio endpoint only ever reads `<id>.mp3` there). */
export const FAILED_SCRIPTS_DIR = "failed-scripts"

export interface EpisodeStore {
  /** Saves the exact MP3 bytes ElevenLabs returned and returns the id the audio endpoint serves them under. */
  save(input: { audio: Uint8Array; title: string }): Promise<{ id: string }>
  read(id: string): Promise<Uint8Array | undefined>
  /** Debug only: writes one JSON file per failed script attempt. Returns the file's name. */
  saveFailedScript(record: FailedScriptRecord): Promise<string>
}

export function createEpisodeStore(dir: string = defaultStorageDir()): EpisodeStore {
  const fileFor = (id: string) => path.join(dir, `${id}.mp3`)

  return {
    async save({ audio, title }) {
      const id = `${slugify(title)}-${randomBytes(4).toString("hex")}`
      await mkdir(dir, { recursive: true })
      await writeFile(fileFor(id), audio)
      return { id }
    },
    async read(id) {
      if (!isEpisodeId(id)) return undefined
      try {
        return await readFile(fileFor(id))
      } catch {
        return undefined
      }
    },
    async saveFailedScript({ attempt, maxAttempts, feedback, script }) {
      const savedAt = new Date().toISOString()
      const name = `${savedAt.replace(/[:.]/g, "-")}-attempt-${attempt}-${randomBytes(2).toString("hex")}.json`
      const folder = path.join(dir, FAILED_SCRIPTS_DIR)
      await mkdir(folder, { recursive: true })
      await writeFile(path.join(folder, name), JSON.stringify({ savedAt, attempt, maxAttempts, feedbackGiven: feedback, script }, null, 2))
      return name
    },
  }
}
