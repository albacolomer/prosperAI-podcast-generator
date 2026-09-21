import { randomBytes } from "node:crypto"
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { z } from "zod"
import type { ScriptResponse } from "../../src/types/script.js"
import type { ValidationIssue } from "../../src/types/validation.js"
import { mp3DurationSeconds } from "./mp3.js"

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

/** What is remembered about a generated podcast besides its audio. `<id>.json` sits next to `<id>.mp3`. */
const storedEpisodeSchema = z.object({
  id: z.string().refine(isEpisodeId),
  title: z.string(),
  summary: z.string(),
  description: z.string(),
  topics: z.array(z.string()),
  sources: z.array(z.object({ name: z.string(), url: z.string().optional() })),
  durationSeconds: z.number(),
  /** When the podcast was generated (ISO 8601): the order of the list. */
  publishedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
})

export type StoredEpisode = z.infer<typeof storedEpisodeSchema>

/** A listed podcast. `recovered` marks one whose details file is missing: its audio exists, but its title and date were rebuilt. */
export type ListedEpisode = StoredEpisode & { recovered?: true }

/** Where a stored episode is played and downloaded. Derived from its id, so it is never stored. */
export function episodeLinks(id: string) {
  return {
    audioUrl: `/api/episode-audio?id=${id}`,
    downloadUrl: `/api/episode-audio?id=${id}&download=1`,
    downloadFilename: downloadFilename(id),
  }
}

/** `ai-pacing-an-ai-force-e9118c58` -> `Ai Pacing An Ai Force`: the best title left when only the audio file remains. */
function titleFromId(id: string): string {
  const words = id.replace(SUFFIX_PATTERN, "").split("-").filter(Boolean)
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") || "Untitled podcast"
}

export interface EpisodeStore {
  /** Saves the exact MP3 bytes ElevenLabs returned and returns the id the audio endpoint serves them under. */
  save(input: { audio: Uint8Array; title: string }): Promise<{ id: string }>
  read(id: string): Promise<Uint8Array | undefined>
  /** Saves the podcast's details next to its audio, so the list of podcasts survives a restart and a new browser. */
  saveEpisode(episode: StoredEpisode): Promise<void>
  /** Every podcast whose audio is stored, newest first. */
  list(): Promise<ListedEpisode[]>
  /** Debug only: writes one JSON file per failed script attempt. Returns the file's name. */
  saveFailedScript(record: FailedScriptRecord): Promise<string>
}

export function createEpisodeStore(dir: string = defaultStorageDir()): EpisodeStore {
  const fileFor = (id: string) => path.join(dir, `${id}.mp3`)
  const detailsFor = (id: string) => path.join(dir, `${id}.json`)

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
    async saveEpisode(episode) {
      const valid = storedEpisodeSchema.parse(episode)
      await mkdir(dir, { recursive: true })
      await writeFile(detailsFor(valid.id), JSON.stringify(valid, null, 2))
    },
    async list() {
      let names: string[]
      try {
        names = await readdir(dir)
      } catch {
        return []
      }
      const ids = names.filter((name) => name.endsWith(".mp3")).map((name) => name.slice(0, -".mp3".length)).filter(isEpisodeId)

      const listed = await Promise.all(
        ids.map(async (id): Promise<ListedEpisode | undefined> => {
          try {
            const parsed = storedEpisodeSchema.safeParse(JSON.parse(await readFile(detailsFor(id), "utf8")))
            // A details file that names another id is not trusted for this audio.
            if (parsed.success && parsed.data.id === id) return parsed.data
          } catch {
            // No details file (a podcast from before they were kept) or an unreadable one: rebuilt from the audio file below.
          }
          try {
            const { size, mtime } = await stat(fileFor(id))
            const title = titleFromId(id)
            return { id, title, summary: title, description: title, topics: [], sources: [], durationSeconds: mp3DurationSeconds(size), publishedAt: mtime.toISOString(), recovered: true }
          } catch {
            return undefined
          }
        }),
      )
      return listed
        .filter((episode): episode is ListedEpisode => episode !== undefined)
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || (a.id < b.id ? 1 : -1))
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
