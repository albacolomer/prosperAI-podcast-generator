import { Loader2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { describeConfigProblem, describeRun, isBannerWorthy } from "@/lib/scheduleText"
import type { ScheduleRunStatus, ScheduleStatus } from "@/types"

interface ScheduledRunBannerProps {
  run: ScheduleRunStatus | null | undefined
  /** A server setting that is keeping the pending episode from starting. */
  configProblem?: Extract<ScheduleStatus, { configured: true }>["configProblem"]
  /** Injectable so a finished run's 24 hours can be tested. */
  now?: number
}

/**
 * The latest scheduled run, when it is worth interrupting Home for: a podcast is being made now, or it failed. A run that
 * finished needs no announcement, and never a remark about how long it took: the episode itself is the announcement.
 */
export function ScheduledRunBanner({ run, configProblem, now }: ScheduledRunBannerProps) {
  const problem = describeConfigProblem(configProblem)
  const notice = describeRun(run)
  const showRun = notice !== null && isBannerWorthy(run, now)
  if (!problem && !showRun) return null

  const problemAlert = problem ? (
    <Alert data-testid="scheduled-config-problem" data-kind="config">
      <AlertTitle>{problem.title}</AlertTitle>
      <AlertDescription>{problem.detail}</AlertDescription>
    </Alert>
  ) : null
  if (!showRun) return problemAlert
  if (!notice) return problemAlert

  if (notice.kind === "failed") {
    return (
      <>
        {problemAlert}
        <Alert variant="destructive" data-testid="scheduled-run-banner" data-kind="failed">
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>{notice.detail}</AlertDescription>
        </Alert>
      </>
    )
  }

  return (
    <>
      {problemAlert}
      <Alert data-testid="scheduled-run-banner" data-kind={notice.kind} role="status">
        {notice.kind === "running" ? <Loader2 className="animate-spin" /> : null}
        <AlertTitle>{notice.title}</AlertTitle>
      </Alert>
    </>
  )
}
