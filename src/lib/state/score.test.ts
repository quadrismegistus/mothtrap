import { describe, expect, it } from 'vitest'
import { mkPost } from '../testing'
import { postScore, postScoreRate, RATE_DAMPING_H } from './score'

describe('postScore', () => {
  it('is the geometric mean of (reposts+1, likes+1, replies+1)', () => {
    // cbrt(3 * 8 * 2) = cbrt(48)
    const s = postScore(mkPost({ reposts: 2, likes: 7, replies: 1 }))
    expect(s).toBeCloseTo(Math.cbrt(48), 10)
  })

  it('is 1 for a post with no engagement (smoothing avoids zero)', () => {
    expect(postScore(mkPost({ reposts: 0, likes: 0, replies: 0 }))).toBeCloseTo(1, 10)
  })

  it('increases with engagement', () => {
    const low = postScore(mkPost({ likes: 1 }))
    const high = postScore(mkPost({ likes: 100 }))
    expect(high).toBeGreaterThan(low)
  })
})

describe('postScoreRate', () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

  it('is raw score over damped age in hours', () => {
    const p = mkPost({ reposts: 2, likes: 7, replies: 1, createdAt: hoursAgo(10) })
    expect(postScoreRate(p)).toBeCloseTo(Math.cbrt(48) / (10 + RATE_DAMPING_H), 2)
  })

  it('ranks a fresh modest post above an old accumulated one', () => {
    const fresh = mkPost({ likes: 20, createdAt: hoursAgo(1) })
    const stale = mkPost({ likes: 60, createdAt: hoursAgo(48) })
    expect(postScoreRate(fresh)).toBeGreaterThan(postScoreRate(stale))
  })

  it('damping keeps a brand-new post finite and modest', () => {
    const now = mkPost({ likes: 2, createdAt: hoursAgo(0) })
    expect(postScoreRate(now)).toBeCloseTo(postScore(now) / RATE_DAMPING_H, 2)
  })
})
