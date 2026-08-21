import { cn } from "@/lib/utils"

function Progress({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("overflow-hidden rounded-md bg-muted", className)}
    >
      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  )
}

export { Progress }
