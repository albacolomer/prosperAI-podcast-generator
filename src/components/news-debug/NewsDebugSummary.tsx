import type { NewsResponse, RemovalReason } from "@/types"

const REASON_LABELS: Record<RemovalReason, string> = {
  invalid: "Invalid",
  "duplicate-url": "Duplicate URL",
  "similar-title": "Similar title",
}

interface NewsDebugSummaryProps {
  data: NewsResponse
  durationMs: number
}

export function NewsDebugSummary({ data, durationMs }: NewsDebugSummaryProps) {
  const { stats, removed = [] } = data
  const rows: [string, string | number][] = [
    ["Interests queried", stats.interests],
    ["Raw articles", stats.raw],
    ["Invalid removed", stats.invalid],
    ["Duplicate URLs removed", stats.duplicateUrl],
    ["Similar titles removed", stats.similarTitle],
    ["Final articles", stats.final],
    ["Request time", `${(durationMs / 1000).toFixed(1)}s`],
  ]

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2 border-b border-border py-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      {removed.length > 0 ? (
        <details className="rounded border border-border p-2">
          <summary className="cursor-pointer font-semibold">Removed articles ({removed.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {removed.map((entry, index) => (
              <li key={`${entry.url}-${index}`}>
                <span className="font-semibold">[{REASON_LABELS[entry.reason]}]</span> {entry.title}
                <span className="block text-muted-foreground">
                  {entry.source} · {entry.interest} · {entry.detail}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
