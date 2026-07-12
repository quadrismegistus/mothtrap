import { describe, expect, it } from 'vitest'
import { mkPost } from '../testing'
import { postScore } from './score'

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
