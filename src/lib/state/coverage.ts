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

/** Bin a sorted-ascending array into `n` bins from `binStart` step `bucket`. */
function binInto(sorted: number[], binStart: number, bucket: number, n: number): number[] {
  const counts = new Array(n).fill(0)
  for (const t of sorted) {
    const i = Math.floor((t - binStart) / bucket)
    if (i >= 0 && i < n) counts[i]++
  }
  return counts
}

/**
 * Bin post timestamps into a coverage histogram. When `trim` is on, the sparse
 * LEADING tail (old posts pulled in as context / reposts of old content, which
 * would otherwise stretch the axis across years) is dropped by DENSITY, not by a
 * single gap: bin the full range coarsely, find the first bin whose volume is a
 * meaningful fraction of the peak, and start there. Middle gaps are preserved —
 * those are real coverage gaps, the whole point of the view. `granOverride`
 * forces the display granularity; otherwise it's auto from the (trimmed) span.
 * Input need not be sorted.
 */
export function coverageBins(
  times: number[],
  granOverride: Gran | null,
  trim: boolean,
): CoverageBins | null {
  const sorted = times.filter((t) => t > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return null

  const min = sorted[0]
  const end = sorted[sorted.length - 1]
  let start = min
  let hidden = 0
  if (trim && sorted.length > 20 && end > min) {
    // Detect at a coarse granularity over the FULL span, independent of the
    // display granularity.
    const dg = BUCKET_MS[autoGran(end - min)]
    const dStart = Math.floor(min / dg) * dg
    const dn = Math.min(Math.floor((end - dStart) / dg) + 1, 8000)
    const dc = binInto(sorted, dStart, dg, dn)
    let peak = 1
    for (const c of dc) if (c > peak) peak = c
    const thresh = Math.max(peak * 0.05, 2) // "substantial" = ≥5% of the peak bin
    const first = dc.findIndex((c) => c >= thresh)
    if (first > 0) {
      const cut = dStart + first * dg
      // Start at the first real post in/after that bin, so the axis hugs the data.
      const s = sorted.find((t) => t >= cut)
      if (s !== undefined) {
        start = s
        hidden = sorted.filter((t) => t < start).length
      }
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
