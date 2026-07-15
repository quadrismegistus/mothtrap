export type Gran = 'hour' | 'day' | 'week' | 'month'

const DAY = 86_400_000
export const BUCKET_MS: Record<Gran, number> = {
  hour: 3_600_000,
  day: DAY,
  week: 604_800_000,
  month: 2_592_000_000, // ~30 days; rough is fine for a histogram
}

/** Sensible default granularity for a time span. */
export function autoGran(span: number): Gran {
  if (span <= 3 * DAY) return 'hour'
  if (span <= 120 * DAY) return 'day'
  if (span <= 3 * 365 * DAY) return 'week'
  return 'month'
}

export interface CoverageBins {
  counts: number[]
  start: number
  bucket: number
  n: number
  peak: number
  empties: number
  shown: number
  hidden: number
  min: number
  max: number
  gran: Gran
}

/**
 * Bin post timestamps into a coverage histogram. When `trim` is on, ancient
 * outliers (pulled-in context / reposts of old content — a few posts stretching
 * the axis across years) are dropped: find the largest time gap, and if the
 * chunk before it is a small fraction (<10%) and the gap is big (>30d), cut it.
 * `granOverride` forces a granularity; otherwise it's auto from the (trimmed)
 * span. Input need not be sorted.
 */
export function coverageBins(
  times: number[],
  granOverride: Gran | null,
  trim: boolean,
): CoverageBins | null {
  const sorted = times.filter((t) => t > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return null

  let start = sorted[0]
  const end = sorted[sorted.length - 1]
  let hidden = 0
  if (trim && sorted.length > 1) {
    let gapAt = -1
    let gapSize = 0
    for (let i = 0; i < sorted.length - 1; i++) {
      const g = sorted[i + 1] - sorted[i]
      if (g > gapSize) {
        gapSize = g
        gapAt = i
      }
    }
    if (gapAt >= 0 && gapSize > 30 * DAY && gapAt + 1 < sorted.length * 0.1) {
      start = sorted[gapAt + 1]
      hidden = gapAt + 1
    }
  }

  const gran = granOverride ?? autoGran(end - start)
  const bucket = BUCKET_MS[gran]
  const binStart = Math.floor(start / bucket) * bucket
  const n = Math.min(Math.floor((end - binStart) / bucket) + 1, 4000)
  const counts = new Array(n).fill(0)
  for (const t of sorted) {
    if (t < start) continue
    const i = Math.floor((t - binStart) / bucket)
    if (i >= 0 && i < n) counts[i]++
  }
  let peak = 1
  let empties = 0
  for (const c of counts) {
    if (c > peak) peak = c
    if (c === 0) empties++
  }
  return { counts, start: binStart, bucket, n, peak, empties, shown: sorted.length - hidden, hidden, min: start, max: end, gran }
}
