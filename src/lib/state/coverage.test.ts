import { describe, it, expect } from 'vitest'
import { coverageBins, autoGran } from './coverage'

const DAY = 86_400_000
const NOW = 1_700_000_000_000

describe('coverageBins', () => {
  it('trims ancient outliers behind a big gap (the real-feed shape)', () => {
    // 5 old context posts over ~2 years, then 100 in the last few days.
    const old = [700, 600, 500, 400, 300].map((d) => NOW - d * DAY)
    const recent = Array.from({ length: 100 }, (_, i) => NOW - i * 3_600_000)
    const b = coverageBins([...old, ...recent], null, true)!
    expect(b.hidden).toBe(5)
    expect(b.shown).toBe(100)
    expect(['hour', 'day']).toContain(b.gran) // trimmed span is days, not years
    expect(b.min).toBeGreaterThan(NOW - 10 * DAY) // starts at the recent bulk
  })

  it('does NOT trim when the old chunk is a large fraction', () => {
    const oldChunk = Array.from({ length: 50 }, (_, i) => NOW - 400 * DAY - i * DAY)
    const recent = Array.from({ length: 50 }, (_, i) => NOW - i * DAY)
    const r = coverageBins([...oldChunk, ...recent], null, true)!
    expect(r.hidden).toBe(0) // 50% before the gap → not an outlier tail
  })

  it('trim=false keeps the full range', () => {
    const times = [NOW - 700 * DAY, ...Array.from({ length: 100 }, (_, i) => NOW - i * 3_600_000)]
    const r = coverageBins(times, null, false)!
    expect(r.hidden).toBe(0)
    expect(r.min).toBeLessThan(NOW - 600 * DAY)
  })

  it('respects a granularity override', () => {
    const times = Array.from({ length: 50 }, (_, i) => NOW - i * 3_600_000)
    expect(coverageBins(times, 'week', true)!.gran).toBe('week')
  })

  it('counts posts into bins with an accurate peak', () => {
    const base = Math.floor(NOW / DAY) * DAY // align to a day boundary
    const times = [base, base + 3_600_000, base + 7_200_000, base + DAY + 3_600_000] // 3 one day, 1 next
    const b = coverageBins(times, 'day', false)!
    expect(b.peak).toBe(3)
    expect(b.shown).toBe(4)
  })

  it('returns null for empty / all-invalid input', () => {
    expect(coverageBins([], null, true)).toBeNull()
    expect(coverageBins([0, -1], null, true)).toBeNull()
  })
})

describe('autoGran', () => {
  it('picks granularity by span', () => {
    expect(autoGran(2 * DAY)).toBe('hour')
    expect(autoGran(30 * DAY)).toBe('day')
    expect(autoGran(200 * DAY)).toBe('week')
    expect(autoGran(1000 * DAY)).toBe('week') // < 3 years
    expect(autoGran(1200 * DAY)).toBe('month') // > 3 years
  })
})
