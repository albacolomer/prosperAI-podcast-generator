import type { PipelineStage, ProgressEvent } from "@/types"

/** What the user reads while an episode is being made. A step is finished only when the server has said so. */
export const GENERATION_STEPS: { label: string; stages: PipelineStage[] }[] = [
  { label: "Finding stories", stages: ["news", "ranking"] },
  { label: "Researching stories", stages: ["research"] },
  { label: "Planning episode", stages: ["planning"] },
  { label: "Writing script", stages: ["writing"] },
  { label: "Checking script", stages: ["checking"] },
  { label: "Generating audio", stages: ["audio"] },
]

export type StepStatus = "pending" | "active" | "done"

/** Which pipeline stages the server has reported as started and as done so far. */
export interface StageProgress {
  started: PipelineStage[]
  done: PipelineStage[]
}

export const NO_PROGRESS: StageProgress = { started: [], done: [] }

export function applyProgress(progress: StageProgress, { stage, status }: ProgressEvent): StageProgress {
  const key = status === "started" ? "started" : "done"
  return progress[key].includes(stage) ? progress : { ...progress, [key]: [...progress[key], stage] }
}

export function stepStatuses(progress: StageProgress): { label: string; status: StepStatus }[] {
  return GENERATION_STEPS.map(({ label, stages }) => {
    if (stages.every((stage) => progress.done.includes(stage))) return { label, status: "done" }
    if (stages.some((stage) => progress.started.includes(stage))) return { label, status: "active" }
    return { label, status: "pending" }
  })
}
