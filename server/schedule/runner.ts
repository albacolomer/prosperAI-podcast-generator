import { generationLock } from "../episode/generationLock.js"
import type { GenerationLock } from "../episode/generationLock.js"
import { episodeLog } from "../episode/log.js"
import { generateFullEpisode } from "../episode/pipeline.js"
import type { PipelineDeps } from "../episode/pipeline.js"
import type { EpisodeRequest } from "../episode/request.js"
import { createPipelineServices } from "../episode/services.js"
import type { PipelineServices } from "../episode/services.js"
import type { NewsLogger } from "../news/log.js"
import { CLAIM_HEARTBEAT_MS, createSlotClaims } from "./claims.js"
import type { SlotClaims } from "./claims.js"
import { checkRunnable } from "./config.js"
import { dueSlot, MAX_SCHEDULED_ATTEMPTS } from "./due.js"
import type { Slot } from "./due.js"
import { classifyFailure, newObservation, observeServices } from "./retry.js"
import { createScheduleStore } from "./store.js"
import type { ScheduleStore } from "./store.js"
import type { RunRecord, ScheduleConfig, ScheduleFile } from "./types.js"

export interface SchedulerDeps {
  store: ScheduleStore
  /** Shared with the manual endpoint: a scheduled run never starts while an episode is being generated, and the other way round. */
  lock: GenerationLock
  /** Shared with every other process on this project: of all of them, one claims a given delivery slot. */
  claims: SlotClaims
  /** How often a claim shows its holder is alive while a run is going. */
  heartbeatMs: number
  env: NodeJS.ProcessEnv
  /** Injectable so tests run the real pipeline with stub services and never touch a provider. */
  createServices: (env: NodeJS.ProcessEnv) => PipelineServices
  generate: (request: Parameters<typeof generateFullEpisode>[0], deps: PipelineDeps) => ReturnType<typeof generateFullEpisode>
  now: () => Date
  log: NewsLogger
}

export type TickOutcome =
  | { status: "no-schedule" | "idle" | "busy" | "no-interests" | "claimed-elsewhere" }
  /** The server is not configured to run an episode. Nothing was claimed or spent: the next tick checks again. */
  | { status: "config-error"; message: string }
  | { status: "completed" | "failed"; slot: string; attempts: number }

const INTERRUPTED_MESSAGE = "The server was restarted while this episode was being generated, so it was not completed."

export function defaultSchedulerDeps(): SchedulerDeps {
  return {
    store: createScheduleStore(),
    lock: generationLock,
    claims: createSlotClaims(),
    heartbeatMs: CLAIM_HEARTBEAT_MS,
    env: process.env,
    createServices: createPipelineServices,
    generate: generateFullEpisode,
    now: () => new Date(),
    log: episodeLog,
  }
}

/** Records a run. A slot that is starting or finished no longer waits on a configuration problem, so the note goes with it. */
const withRun = (file: ScheduleFile, run: RunRecord): ScheduleFile => ({ ...file, run, problem: null })

/**
 * A run still marked "running" that nobody is running was cut short by a restart or a crash. "Nobody" means this process does
 * not hold the scheduled lock AND no live process holds the slot's claim: a run that another dev server on this project is
 * carrying out is left alone. It is closed as failed and NOT run again: repeating a possibly finished, paid-for run
 * automatically is the costly mistake. Claims left by processes that died are removed on the way.
 */
export async function recoverInterruptedRun({ store, lock, claims, now }: Pick<SchedulerDeps, "store" | "lock" | "claims" | "now">): Promise<void> {
  await claims.pruneStale()
  if (lock.owner() === "scheduled") return
  const { run } = await store.read()
  if (run?.status !== "running") return
  if ((await claims.inspect(run.slotDate)) === "live") return
  await store.update((file) =>
    file.run?.status === "running" && file.run.slotDate === run.slotDate && lock.owner() !== "scheduled"
      ? withRun(file, { ...file.run, status: "failed", finishedAt: now().toISOString(), error: { message: INTERRUPTED_MESSAGE, retryable: false } })
      : file,
  )
}

/** Notes (once) why the pending slot cannot start, so the user can see it. Claims nothing. */
async function noteProblem(store: ScheduleStore, current: ScheduleFile, message: string, now: Date): Promise<void> {
  if (current.problem?.message === message) return
  await store.update((file) => (file.problem?.message === message ? file : { ...file, problem: { message, since: now.toISOString() } }))
}

/**
 * One look at the schedule: starts the due slot, if there is one, and follows it to the end (both attempts, if the first
 * fails in a way worth repeating). Called by a timer in the dev server; it holds no state of its own, so it is safe to call
 * as often as wanted, after a restart, and from several processes at once.
 *
 * Before a slot can start it must clear, in this order: the schedule has interests; the server is configured (nothing is
 * claimed or spent otherwise, and the next tick tries again); this process is not already generating (the in-memory lock);
 * and no other process has claimed the slot (the claim file). Only then is the slot recorded as running and the pipeline started.
 */
export async function runScheduleTick(overrides: Partial<SchedulerDeps> = {}): Promise<TickOutcome> {
  const deps = { ...defaultSchedulerDeps(), ...overrides }
  const { store, lock, claims, env, now, log } = deps

  await recoverInterruptedRun(deps)
  const initial = await store.read()
  if (!initial.config) return { status: "no-schedule" }
  // The backstop: a schedule with nothing to talk about never reaches the pipeline, so no provider is called and no slot is
  // claimed (the schedule stays as it is and picks up again when an interest is added).
  if (initial.config.enabled && initial.config.interests.length === 0) return { status: "no-interests" }
  const pending = dueSlot(initial.config, initial.run, now())
  if (!pending) {
    if (initial.problem) await store.update((file) => ({ ...file, problem: null }))
    return { status: "idle" }
  }

  // A server that cannot run an episode does not use up the slot: the problem is noted and the next tick looks again.
  const runnable = checkRunnable(initial.config, env)
  if (!runnable.ok) {
    log(`Scheduled episode for ${pending.key} cannot start: ${runnable.message}`)
    await noteProblem(store, initial, runnable.message, now())
    return { status: "config-error", message: runnable.message }
  }

  // A manual episode (or another tick in this process) is running: leave the slot unclaimed and look again next time.
  const release = lock.tryAcquire("scheduled")
  if (!release) return { status: "busy" }
  let claim: Awaited<ReturnType<SlotClaims["tryClaim"]>> = undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  try {
    claim = await claims.tryClaim(pending.date)
    if (!claim) return { status: "claimed-elsewhere" }
    const held = claim
    heartbeat = setInterval(() => void held.touch().catch(() => undefined), deps.heartbeatMs)

    // Look again now that the slot is ours: the schedule may have been switched off, or the slot recorded by a process that
    // held the claim a moment ago. This second look, taken inside the claim, is what makes the claim decisive.
    const { config, run, problem } = await store.read()
    if (config?.enabled && config.interests.length === 0) return { status: "no-interests" }
    const slot = config ? dueSlot(config, run, now()) : undefined
    if (!config || !slot || slot.date !== pending.date) return { status: "idle" }
    const again = checkRunnable(config, env)
    if (!again.ok) {
      await noteProblem(store, { ...initial, problem }, again.message, now())
      return { status: "config-error", message: again.message }
    }
    return await runSlot(config, slot, again.request, deps)
  } finally {
    clearInterval(heartbeat)
    await claim?.release().catch((error) => log(`Could not remove the claim on the slot (${error instanceof Error ? error.name : "unknown error"})`))
    release()
  }
}

/** Records the slot as running (the claim in the saved schedule), then makes up to MAX_SCHEDULED_ATTEMPTS full pipeline attempts with the same settings. */
async function runSlot(config: ScheduleConfig, slot: Slot, request: EpisodeRequest, deps: SchedulerDeps): Promise<TickOutcome> {
  const { store, env, now, log } = deps
  const base = { slot: slot.key, slotDate: slot.date, timeZone: config.timeZone, deliveryAt: slot.deliveryAt.toISOString(), startedAt: now().toISOString() }

  const fail = async (attempts: number, message: string, retryable: boolean): Promise<TickOutcome> => {
    await store.update((file) => withRun(file, { ...base, status: "failed", attempts, finishedAt: now().toISOString(), error: { message, retryable } }))
    log(`Scheduled episode for ${slot.key} failed after ${attempts} attempt(s): ${message}`)
    return { status: "failed", slot: slot.key, attempts }
  }

  // The claim in the saved schedule. It is written before anything is spent, so nothing that happens after it (a crash, a
  // restart, another tick, a changed delivery time) can start this slot again.
  await store.update((file) => withRun(file, { ...base, status: "running", attempts: 1 }))
  log(`Scheduled episode for ${slot.key} claimed; generating (attempt 1 of ${MAX_SCHEDULED_ATTEMPTS})`)

  const services = deps.createServices(env)
  for (let attempt = 1; ; attempt++) {
    const observation = newObservation()
    try {
      const { episode } = await deps.generate(request, { ...observeServices(services, observation), log })
      const finishedAt = now()
      const late = finishedAt.getTime() > slot.deliveryAt.getTime()
      await store.update((file) =>
        withRun(file, { ...base, status: "completed", attempts: attempt, finishedAt: finishedAt.toISOString(), late, episodeId: episode.id }),
      )
      log(`Scheduled episode for ${slot.key} ready after ${attempt} attempt(s)${late ? " (late)" : ""}`)
      return { status: "completed", slot: slot.key, attempts: attempt }
    } catch (error) {
      const verdict = classifyFailure(error, observation)
      if (!verdict.retryable || attempt >= MAX_SCHEDULED_ATTEMPTS) return fail(attempt, verdict.message, verdict.retryable)
      log(`Scheduled attempt ${attempt} of ${MAX_SCHEDULED_ATTEMPTS} failed (${verdict.message}); trying again`)
      await store.update((file) => withRun(file, { ...base, status: "running", attempts: attempt + 1 }))
    }
  }
}
