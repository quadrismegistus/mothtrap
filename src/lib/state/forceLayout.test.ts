import { describe, expect, it } from 'vitest'
import { ForceLayout, type Target } from './forceLayout'

/**
 * The layout engine had no tests at all, which is how a run of defects reached
 * a pull request: a clamp whose arithmetic cancelled itself out so the
 * reservoir never existed, a bleed that had no effect on the vertical axis, and
 * group passes that undid each other. Every case here is one of those, written
 * so the next one fails a test instead of a screenshot.
 *
 * The sim is driven by hand — `tick()` rather than the internal timer — so
 * these are deterministic and need no fake clock.
 */

const PILL = { hw: 106, hh: 28 }
const GAP = { x: 34, y: 32 }
const W = 1200
const H = 800

function node(id: string, tx: number, ty: number, group?: string): Target {
  return { id, tx, ty, r: 33, ...PILL, group }
}

/** A layout with pill-shaped nodes and a reservoir, as pill mode configures it. */
function pillLayout(bleedX = 170, bleedY = 62) {
  const l = new ForceLayout(() => {})
  l.setCollision(GAP)
  l.setBounds(W, H, 18, 52, bleedX, bleedY)
  return l
}

const at = (l: ForceLayout, id: string) => l.positions().get(id)!
// step(), not sim.tick(): d3's tick() does not dispatch its event, so ticking
// directly would skip the clamp and test positions the app never renders.
const settle = (l: ForceLayout, ticks = 220) => l.step(ticks)

describe('collision', () => {
  it('separates pills by the configured gap rather than a circle around them', () => {
    // A circle circumscribing a 212x56 pill reserves about four times the area
    // the pill occupies, which read as a scatter of islands.
    const l = pillLayout()
    l.update([node('a', 600, 400), node('b', 640, 410)], [])
    settle(l)
    const a = at(l, 'a')
    const b = at(l, 'b')
    const gapX = Math.abs(a.x - b.x) - 2 * PILL.hw
    const gapY = Math.abs(a.y - b.y) - 2 * PILL.hh
    // Resolved on one axis or the other, never overlapping on both.
    expect(gapX >= -1 || gapY >= -1).toBe(true)
  })
})

describe('the reservoir', () => {
  it('lets a node park with its CENTRE beyond the frame', () => {
    // The first version clamped to `hw + edge - bleedX`. With bleedX == hw that
    // cancels to a positive inset, so every centre stayed inside the frame and
    // the reservoir silently did not exist. Nothing about the graph looked
    // wrong; there was simply never anything parked.
    const l = pillLayout()
    l.update([node('far', -160, 400)], [])
    settle(l, 5)
    expect(at(l, 'far').x).toBeLessThan(0)
  })

  it('applies a vertical bleed at all', () => {
    // bleedY was a no-op for the same reason, one axis over: the range it
    // allowed sat entirely inside the band the edge resolution then rewrote.
    const shallow = pillLayout(170, 0)
    shallow.update([node('n', 600, -400)], [])
    settle(shallow, 5)
    const withoutBleed = at(shallow, 'n').y

    const deep = pillLayout(170, 400)
    deep.update([node('n', 600, -400)], [])
    settle(deep, 5)
    expect(at(deep, 'n').y).toBeLessThan(withoutBleed)
  })
})

describe('the frame edge', () => {
  it('never leaves a node sliced by it', () => {
    const l = pillLayout()
    // Straddling the right edge: half in, half out.
    l.update([node('n', W - 10, 400)], [])
    settle(l, 5)
    const { x } = at(l, 'n')
    const wholly = x + PILL.hw <= W + 1 || x - PILL.hw >= W - 1
    expect(wholly).toBe(true)
  })

  it('keeps a node clear of the bottom chrome', () => {
    // `bottom` was passed to setBounds and then ignored: the edge resolution
    // used 0 and h, so the last stripe of a bottom-row pill came to rest behind
    // the Digest bar.
    const l = pillLayout()
    l.update([node('n', 600, H)], [])
    settle(l, 40)
    const { y } = at(l, 'n')
    const insideVisible = y + PILL.hh <= H - 52 + 1
    const parkedBelow = y - PILL.hh >= H - 52 - 1
    expect(insideVisible || parkedBelow).toBe(true)
  })

  it('leaves a node alone on a canvas too narrow to satisfy both edges', () => {
    // Below 2x the half-extent the two resolutions contradict; resolving anyway
    // pushed a node off the left edge in order to clear the right.
    const narrow = new ForceLayout(() => {})
    narrow.setCollision(GAP)
    narrow.setBounds(250, H, 18, 52, 170, 62)
    narrow.update([node('n', 125, 400)], [])
    settle(narrow, 5)
    expect(Number.isFinite(at(narrow, 'n').x)).toBe(true)
  })
})

describe('conversations move as one', () => {
  const tree = (group: string, x: number, y: number): Target[] => [
    node(`${group}-root`, x, y, group),
    node(`${group}-a`, x - 120, y + 90, group),
    node(`${group}-b`, x + 120, y + 90, group),
  ]

  it('keeps a parked tree in shape instead of squashing it flat', () => {
    // Clamping members independently collapsed a parked thread onto a single
    // coordinate: the rows all landed on the same pixel, destroying the tidy
    // shape the group passes exist to preserve.
    const l = pillLayout()
    l.update(tree('t', 600, -500), [])
    settle(l, 10)
    const ys = ['t-root', 't-a', 't-b'].map((id) => at(l, id).y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(40)
  })

  it('does not split a conversation across the frame edge', () => {
    const l = pillLayout()
    l.update(tree('t', W - 40, 400), [])
    settle(l, 40)
    const xs = ['t-root', 't-a', 't-b'].map((id) => at(l, id).x)
    const allIn = xs.every((x) => x + PILL.hw <= W + 1)
    const allOut = xs.every((x) => x - PILL.hw >= W - 1)
    expect(allIn || allOut).toBe(true)
  })

  it('holds two conversations apart', () => {
    const l = pillLayout()
    l.update([...tree('a', 560, 400), ...tree('b', 640, 420)], [])
    settle(l, 60)
    const box = (g: string) => {
      const xs = [`${g}-root`, `${g}-a`, `${g}-b`].map((id) => at(l, id))
      return {
        l: Math.min(...xs.map((p) => p.x)) - PILL.hw,
        r: Math.max(...xs.map((p) => p.x)) + PILL.hw,
        t: Math.min(...xs.map((p) => p.y)) - PILL.hh,
        b: Math.max(...xs.map((p) => p.y)) + PILL.hh,
      }
    }
    const A = box('a')
    const B = box('b')
    const overlapX = Math.min(A.r, B.r) - Math.max(A.l, B.l)
    const overlapY = Math.min(A.b, B.b) - Math.max(A.t, B.t)
    expect(overlapX <= 1 || overlapY <= 1).toBe(true)
  })

  it('settles to the same place twice from the same targets', () => {
    // The passes used to measure where nodes had DRIFTED, so the result
    // depended on history: separation found nothing to do, forceX pulled the
    // groups back together, and the next arrival shoved them apart again.
    const targets = [...tree('a', 560, 400), ...tree('b', 640, 420)]
    const first = pillLayout()
    first.update(targets, [])
    settle(first, 120)
    const second = pillLayout()
    second.update(targets, [])
    settle(second, 120)
    for (const id of ['a-root', 'b-root']) {
      expect(at(second, id).x).toBeCloseTo(at(first, id).x, 0)
      expect(at(second, id).y).toBeCloseTo(at(first, id).y, 0)
    }
  })
})

describe('dragging', () => {
  it('keeps a dragged node where the clamp put it, not where the pointer went', () => {
    // dragTo sets fx/fy, which d3 restores at the top of every tick. Without
    // clamping those too the rendered pill stopped tracking the cursor near an
    // edge and then jumped the whole hysteresis band when the pointer crossed.
    const l = pillLayout()
    l.update([node('n', 600, 400)], [])
    settle(l, 5)
    l.dragTo('n', 600, H + 500) // far below the canvas
    settle(l, 5)
    const after = at(l, 'n')
    l.step()
    expect(at(l, 'n').y).toBeCloseTo(after.y, 0) // no snap-back on the next tick
  })
})

describe('circles, when no gap is configured', () => {
  it('clamps every node fully inside the frame', () => {
    const l = new ForceLayout(() => {})
    l.setCollision(null)
    l.setBounds(W, H, 18, 52)
    l.update([{ id: 'a', tx: -500, ty: -500, r: 33 }], [])
    settle(l, 5)
    const { x, y } = at(l, 'a')
    expect(x).toBeGreaterThanOrEqual(33)
    expect(y).toBeGreaterThanOrEqual(18)
  })
})
