import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type ForceX,
  type ForceY,
  type Simulation,
  type SimulationNodeDatum,
} from 'd3-force'

export interface SimNode extends SimulationNodeDatum {
  id: string
  /** Semantic target position (px) this node is pulled toward. */
  tx: number
  ty: number
  /** Radius (px), for collision. */
  r: number
  /** Half-extents (px) when the node is a rectangle rather than a circle.
   * Set only in pill mode; see setCollision. */
  hw?: number
  hh?: number
  group?: string
}

export interface Target {
  id: string
  tx: number
  ty: number
  r: number
  hw?: number
  hh?: number
  group?: string
}

/**
 * Axis-aligned rectangle collision, for pill-shaped nodes.
 *
 * d3's forceCollide is circular, and a circle circumscribing a 208x56 pill
 * reserves about four times the area the pill occupies — enough that the graph
 * reads as a handful of islands instead of a conversation. This resolves the
 * real overlap instead, separating each pair along whichever axis they overlap
 * least, so pills stack closely in rows the way they look like they should.
 *
 * O(n^2), which is fine: pill mode caps the graph at a few dozen nodes, and a
 * quadtree would cost more in complexity than it saves in a thousand pair
 * checks per tick.
 */
function rectCollide(padX: number, padY: number, strength = 0.7, iterations = 2) {
  let nodes: SimNode[] = []
  // Deliberately ignores alpha, as d3's own forceCollide does. Scaling the
  // push by alpha means separation weakens as the sim cools, so overlapping
  // pills simply freeze that way instead of resolving — which is exactly what
  // the first version of this did.
  const force = () => {
    for (let pass = 0; pass < iterations; pass++)
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      if (a.x == null || a.y == null) continue
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]
        if (b.x == null || b.y == null) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const ox = (a.hw ?? a.r) + (b.hw ?? b.r) + padX - Math.abs(dx)
        if (ox <= 0) continue
        const oy = (a.hh ?? a.r) + (b.hh ?? b.r) + padY - Math.abs(dy)
        if (oy <= 0) continue
        // Separate along the axis of least penetration: pills that merely graze
        // side-on shouldn't be flung vertically.
        const k = strength * 0.5
        if (ox < oy) {
          const push = (dx < 0 ? -1 : 1) * ox * k
          a.vx = (a.vx ?? 0) - push
          b.vx = (b.vx ?? 0) + push
        } else {
          const push = (dy < 0 ? -1 : 1) * oy * k
          a.vy = (a.vy ?? 0) - push
          b.vy = (b.vy ?? 0) + push
        }
      }
    }
  }
  force.initialize = (n: SimNode[]) => {
    nodes = n
  }
  return force
}

export interface SimLink {
  source: string
  target: string
}

/**
 * Anchored force layout. Nodes are pulled toward rank-based semantic targets
 * (x = engagement, y = recency) rather than floating freely, so the meaning of
 * position survives. Collision keeps avatars from overlapping and a weak link
 * force lets replies drift toward parents. Tuned to *ease* into place over a few
 * seconds (low alphaDecay, high velocityDecay) — motion in slow-mo, not a snap.
 */
export class ForceLayout {
  readonly sim: Simulation<SimNode, SimLink>
  #nodes: SimNode[] = []
  #byId = new Map<string, SimNode>()
  // Canvas bounds — nodes are clamped fully inside so they can't drift up behind
  // the top bar (or off any edge). Set via setBounds; 0 = unbounded.
  // The bottom chrome (gear bottom-left, Digest/Load-more bottom-right) lives in
  // the CORNERS, so a bigger bottom inset is reserved only there — the
  #bounds = { w: 0, h: 0, top: 0, bottom: 0, bleedX: 0, bleedY: 0 }
  #edge = 2

  constructor(onTick: () => void) {
    this.sim = forceSimulation<SimNode, SimLink>([])
      .alphaDecay(0.012) // slow settle (~7–8s)
      .velocityDecay(0.5) // friction
      .force('x', forceX<SimNode>((d) => d.tx).strength(0.08))
      .force('y', forceY<SimNode>((d) => d.ty).strength(0.08))
      .force('collide', forceCollide<SimNode>((d) => d.r + 9).strength(0.9))
      .on('tick', () => {
        this.#clamp()
        onTick()
      })
    this.sim.stop()
  }

  /**
   * Advance the simulation synchronously, clamping as the tick handler does.
   *
   * d3's `simulation.tick()` deliberately does NOT dispatch its "tick" event,
   * so stepping by hand skips the clamp and produces positions the running sim
   * would never yield. An earlier attempt to settle the first layout by calling
   * tick() in a loop appeared to achieve nothing for exactly this reason.
   */
  step(n = 1) {
    for (let i = 0; i < n; i++) {
      this.sim.tick()
      this.#clamp()
    }
  }

  /** Circles (avatars), or rectangles with the caller's gap (post pills). Cheap
   * to flip: the sim keeps its nodes and positions, so toggling re-settles
   * rather than restarting. The gap comes from the caller so that the collision,
   * the tidy-tree grid and the node budget all read the same number — three
   * copies of it would drift apart the first time one was tuned. */
  setCollision(gap: { x: number; y: number } | null) {
    // Keep nodes off the canvas edge by the same gap they keep from each other.
    // The old 2px was fine for an avatar but leaves a 212px pill flush against
    // the frame, where it sits on top of the axis labels.
    this.#edge = gap ? Math.min(gap.x, gap.y) : 2
    this.sim.force(
      'collide',
      gap ? rectCollide(gap.x, gap.y) : forceCollide<SimNode>((d) => d.r + 9).strength(0.9),
    )
  }

  /**
   * Bounding box of a group's TARGETS, including each member's padding.
   *
   * Targets, not positions. The passes below run once per update, and update()
   * resets every tx/ty from the incoming targets first -- so measuring where
   * nodes happen to have drifted made the result depend on history: a pass
   * would find no overlap (positions still separated from last time), shift
   * nothing, and forceX would then drag the groups back together until the next
   * arrival shoved them apart again. Measuring targets makes each update
   * deterministic and idempotent.
   */
  #boxOf(members: SimNode[]) {
    let l = Infinity
    let r = -Infinity
    let t = Infinity
    let b = -Infinity
    for (const n of members) {
      const hw = (n.hw ?? n.r) + this.#edge
      const hh = (n.hh ?? n.r) + this.#edge
      l = Math.min(l, n.tx - hw)
      r = Math.max(r, n.tx + hw)
      t = Math.min(t, n.ty - hh)
      b = Math.max(b, n.ty + hh)
    }
    return { l, r, t, b }
  }

  #groups() {
    const groups = new Map<string, SimNode[]>()
    for (const n of this.#nodes) {
      if (n.x == null || n.y == null) continue
      const key = n.group ?? n.id // an ungrouped post is its own group
      const g = groups.get(key)
      if (g) g.push(n)
      else groups.set(key, [n])
    }
    return groups
  }

  /** Move a whole group's targets, and its positions with them so members do
   * not have to travel to a place the layout has already decided. */
  #shift(members: SimNode[], dx: number, dy: number) {
    for (const n of members) {
      n.tx += dx
      n.ty += dy
      if (n.x != null) n.x += dx
      if (n.y != null) n.y += dy
    }
  }

  /**
   * Hold whole conversations apart from each other.
   *
   * Collision acts on single posts, so two neighbouring trees interpenetrate and
   * shove each other member by member -- which reads as bouncing rather than as
   * two threads finding their places. A tree is one object, so it repels as one:
   * overlapping bounding boxes are separated along whichever axis they overlap
   * least, and every member moves by the same amount, leaving the tidy-tree
   * shape untouched.
   *
   * Once per update, on targets as well as positions. Per-tick this would be the
   * same accumulating shove it is meant to replace.
   */
  #separateGroups() {
    const groups = [...this.#groups().values()].filter((g) => g.length > 1)
    if (groups.length < 2) return
    for (let pass = 0; pass < 12; pass++) {
      let moved = false
      for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          const a = this.#boxOf(groups[i])
          const b = this.#boxOf(groups[j])
          const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l)
          if (ox <= 0) continue
          const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t)
          if (oy <= 0) continue
          const acx = (a.l + a.r) / 2
          const bcx = (b.l + b.r) / 2
          const acy = (a.t + a.b) / 2
          const bcy = (b.t + b.b) / 2
          if (ox < oy) {
            const push = (bcx < acx ? -1 : 1) * ox * 0.5
            this.#shift(groups[i], -push, 0)
            this.#shift(groups[j], push, 0)
          } else {
            const push = (bcy < acy ? -1 : 1) * oy * 0.5
            this.#shift(groups[i], 0, -push)
            this.#shift(groups[j], 0, push)
          }
          moved = true
        }
      }
      if (!moved) break
    }
  }

  /**
   * Keep a whole conversation on one side of the frame edge.
   *
   * Resolving posts one at a time leaves every post whole but lets a reply tree
   * split across the boundary -- half a thread in view, half out, with edges
   * running off into nothing. A tree reads as one object, so it moves as one:
   * the group's bounding box decides, and every member shifts by the same
   * amount, which preserves the tidy-tree shape exactly.
   *
   * A tree too large to fit the frame is left alone. Shoving it wholly outside
   * would hide a conversation the reader can only ever see part of, which is
   * worse than showing part of it.
   *
   * Called once per update. It moves targets as well as positions, so it must
   * NOT run per-tick: doing that accumulated a fresh shift every frame and the
   * layout visibly bounced while the forces chased it.
   */
  #unstraddleGroups() {
    const { w, h, bleedX, bleedY } = this.#bounds
    if (!bleedX && !bleedY) return
    const groups = new Map<string, SimNode[]>()
    for (const n of this.#nodes) {
      if (!n.group || n.x == null || n.y == null) continue
      const g = groups.get(n.group)
      if (g) g.push(n)
      else groups.set(n.group, [n])
    }
    for (const members of groups.values()) {
      if (members.length < 2) continue // a lone post is already resolved
      let l = Infinity
      let r = -Infinity
      let t = Infinity
      let bm = -Infinity
      for (const n of members) {
        const hw = (n.hw ?? n.r) + this.#edge
        const hh = (n.hh ?? n.r) + this.#edge
        l = Math.min(l, n.x! - hw)
        r = Math.max(r, n.x! + hw)
        t = Math.min(t, n.y! - hh)
        bm = Math.max(bm, n.y! + hh)
      }
      let dx = 0
      let dy = 0
      if (bleedX && this.#resolvable((r - l) / 2, w)) {
        if (l < 0 && r > 0) dx = (l + r) / 2 > 0 ? -l : -r
        else if (l < w && r > w) dx = (l + r) / 2 < w ? w - r : w - l
      }
      if (bleedY && this.#resolvable((bm - t) / 2, h)) {
        if (t < 0 && bm > 0) dy = (t + bm) / 2 > 0 ? -t : -bm
        else if (t < h && bm > h) dy = (t + bm) / 2 < h ? h - bm : h - t
      }
      if (!dx && !dy) continue
      for (const n of members) {
        n.x! += dx
        n.y! += dy
        n.tx += dx // move the target too, or the forces drag it straight back
        n.ty += dy
      }
    }
  }

  /**
   * Resolve a straddled frame edge: a post is either in the frame or out of it,
   * never sliced by the boundary. Half a post is unreadable, and it doesn't read
   * as "there is more over here" either -- it just looks broken.
   *
   * Which way it resolves is decided by the side its centre is already on, which
   * gives the rule its own hysteresis: a node cannot oscillate across the edge,
   * because crossing the centre line is what changes the answer.
   */
  #unstraddle(c: number, half: number, edge: number): number {
    if (c - half < edge && c + half > edge) return c > edge ? edge + half : edge - half
    return c
  }

  /**
   * Resolve a span that crosses an edge, biased toward staying VISIBLE.
   *
   * Deciding by centre alone sends a conversation outside as soon as more than
   * half of it hangs over the line, which parked far more than it needed to --
   * measured, ten of twenty posts. A tree is pushed out only when little enough
   * of it is showing that the sliver would be noise rather than content.
   */
  #resolveSpan(lo: number, hi: number, edge: number, insideIsAbove: boolean): number {
    const span = hi - lo
    if (span <= 0) return 0
    const inside = insideIsAbove
      ? Math.min(hi, Number.POSITIVE_INFINITY) - Math.max(lo, edge)
      : Math.min(hi, edge) - lo
    const fraction = Math.max(0, Math.min(1, inside / span))
    const KEEP_VISIBLE = 0.3
    if (fraction >= KEEP_VISIBLE) return insideIsAbove ? edge - lo : edge - hi // pull in
    return insideIsAbove ? edge - hi : edge - lo // push out
  }

  /** Can both edges of a span be satisfied at once? Below 2x the half-extent
   * the two resolutions contradict -- on a 250px canvas a 138px half pushed a
   * node off the left edge to clear the right -- so it is better to leave it. */
  #resolvable(half: number, span: number): boolean {
    return 2 * half <= span
  }

  /** Keep every node fully within the canvas (below `top`, above `bottom`, and
   * inside the left/right edges), respecting its radius. */
  /**
   * `bleed` lets nodes live OUTSIDE the visible frame — a reservoir parked just
   * past each edge. Dismissing an on-screen post re-ranks everything, and the
   * reservoir's nearest member drifts inward to take its place, instead of a
   * replacement popping into existence mid-canvas.
   */
  setBounds(w: number, h: number, top: number, bottom: number, bleedX = 0, bleedY = 0) {
    this.#bounds = { w, h, top, bottom, bleedX, bleedY }
  }
  #clamp() {
    const { w, h, top, bottom, bleedX, bleedY } = this.#bounds
    if (!w || !h) return
    const e = this.#edge
    // The VISIBLE content edges. `top`/`bottom` are the chrome keep-outs, and a
    // pill resolved against 0/h instead came to rest with its last 20px behind
    // the Digest bar -- `bottom` was passed in and then ignored.
    const visT = top
    const visB = h - bottom

    // Grouped nodes clamp as a unit. Clamping members independently squashed a
    // parked conversation flat: a four-level thread at y = [-320,-232,-144,-56]
    // became [-60,-60,-60,-60], destroying the tidy-tree shape the group passes
    // exist to preserve, and then rectCollide had to explode it apart again as
    // it re-entered. Positions only -- targets belong to update(), and moving
    // them from the tick path is what made the layout oscillate before.
    for (const members of this.#groups().values()) {
      let l = Infinity
      let r = -Infinity
      let t = Infinity
      let b = -Infinity
      for (const n of members) {
        const hw = (n.hw ?? n.r) + e
        const hh = (n.hh ?? n.r) + e
        l = Math.min(l, n.x! - hw)
        r = Math.max(r, n.x! + hw)
        t = Math.min(t, n.y! - hh)
        b = Math.max(b, n.y! + hh)
      }
      // The world a group may occupy: the frame plus the reservoir on each side.
      const worldL = bleedX ? -bleedX - (r - l) / 2 : 0
      const worldR = bleedX ? w + bleedX + (r - l) / 2 : w
      const worldT = bleedY ? visT - bleedY - (b - t) / 2 : visT
      const worldB = bleedY ? visB + bleedY + (b - t) / 2 : visB

      let dx = 0
      let dy = 0
      if (l < worldL) dx = worldL - l
      else if (r > worldR) dx = worldR - r
      if (t < worldT) dy = worldT - t
      else if (b > worldB) dy = worldB - b

      // Never slice the visible edge: resolve the whole group to one side, but
      // only when it could fit -- shoving an oversized conversation entirely out
      // of view hides something you can at best see part of.
      if (bleedX && this.#resolvable((r - l) / 2, w)) {
        if (l + dx < 0 && r + dx > 0) dx += this.#resolveSpan(l + dx, r + dx, 0, true)
        if (l + dx < w && r + dx > w) dx += this.#resolveSpan(l + dx, r + dx, w, false)
      }
      if (bleedY && this.#resolvable((b - t) / 2, visB - visT)) {
        if (t + dy < visT && b + dy > visT) dy += this.#resolveSpan(t + dy, b + dy, visT, true)
        if (t + dy < visB && b + dy > visB) dy += this.#resolveSpan(t + dy, b + dy, visB, false)
      }

      for (const n of members) {
        if (n.x != null) n.x += dx
        if (n.y != null) n.y += dy
        if (!bleedX && n.x != null) {
          const hw = (n.hw ?? n.r) + e
          n.x = Math.max(hw, Math.min(w - hw, n.x))
        }
        if (!bleedY && n.y != null) {
          const hh = (n.hh ?? n.r) + e
          n.y = Math.max(visT + hh, Math.min(visB - hh, n.y))
        }
        // A dragged node is clamped through fx/fy too, or d3 restores x = fx at
        // the top of every tick and the pill stops tracking the cursor near an
        // edge, then jumps the hysteresis band when the pointer crosses it.
        if (n.fx != null && n.fy != null) {
          n.fx = n.x
          n.fy = n.y
        }
      }
    }
  }

  /**
   * Reconcile the simulation with a new set of targets + links. Existing nodes
   * keep their current position/velocity (continuous motion); new nodes start at
   * their target so they ease outward rather than flying in from origin — except
   * a new node linked to an already-placed one (a mapped thread reply), which is
   * seeded beside its partner so it visibly emanates from the conversation
   * rather than materializing elsewhere on the canvas. Dropped nodes are
   * removed. Then the sim gently reheats.
   */
  update(
    targets: Target[],
    links: SimLink[],
    pinned: ReadonlySet<string> = new Set(),
    /** 0 = nodes glued to their recency/engagement targets; 1 = links + charge
     * dominate and connected posts clump. Interpolated, not a switch. */
    cohesion = 0,
  ) {
    // For a new node, find an already-placed anchor: follow the reply→parent
    // chain (a freshly mapped thread anchors to the clicked post), else any
    // directly linked placed node (a pulled-in parent anchors to its reply).
    const parentOf = new Map(links.map((l) => [l.source, l.target]))
    const anchorFor = (id: string): SimNode | undefined => {
      let cur: string | undefined = id
      for (let hops = 0; cur && hops < 32; hops++) {
        const found = this.#byId.get(cur)
        if (found) return found
        cur = parentOf.get(cur)
      }
      const back = links.find((l) => l.target === id && this.#byId.has(l.source))
      return back ? this.#byId.get(back.source) : undefined
    }
    const next: SimNode[] = []
    const nextById = new Map<string, SimNode>()
    for (const t of targets) {
      const existing = this.#byId.get(t.id)
      let node: SimNode
      if (existing) {
        node = existing
      } else {
        const near = anchorFor(t.id)
        const sx = near?.x != null ? near.x + (Math.random() - 0.5) * 24 : t.tx
        const sy = near?.y != null ? near.y + (Math.random() - 0.5) * 24 : t.ty
        node = { id: t.id, x: sx, y: sy, tx: t.tx, ty: t.ty, r: t.r, hw: t.hw, hh: t.hh, group: t.group }
      }
      node.tx = t.tx
      node.ty = t.ty
      if (this.#bounds.w) {
        const bhw = (t.hw ?? t.r) + this.#edge
        const bhh = (t.hh ?? t.r) + this.#edge
        const { w: bw, h: bh, top: bt, bottom: bb, bleedX: bx, bleedY: by } = this.#bounds
        if (bx) {
          node.tx = this.#unstraddle(this.#unstraddle(node.tx, bhw, 0), bhw, bw)
        }
        if (by) {
          node.ty = this.#unstraddle(this.#unstraddle(node.ty, bhh, 0), bhh, bh)
        }
      }
      node.r = t.r
      node.hw = t.hw
      node.hh = t.hh
      node.group = t.group
      // Pinned nodes are fixed at their current position (fx/fy); others are free.
      if (pinned.has(t.id)) {
        node.fx = node.x ?? t.tx
        node.fy = node.y ?? t.ty
      } else {
        node.fx = null
        node.fy = null
      }
      next.push(node)
      nextById.set(t.id, node)
    }
    this.#nodes = next
    this.#byId = nextById
    // Once per update, not once per tick. Run from #clamp it re-shifted targets
    // on every frame, so the forces were chasing a target that kept moving --
    // which is what the bouncing was.
    // Iterated, because the two constraints interact: pulling a straddling tree
    // back inside the frame can drop it onto the neighbour it was just
    // separated from, and separating two trees can push one back across the
    // edge. Three rounds settles the realistic cases; it is a fixed bound
    // rather than a guarantee, and the per-node clamp is the backstop.
    for (let round = 0; round < 3; round++) {
      this.#separateGroups()
      this.#unstraddleGroups()
    }

    // Only keep links whose endpoints are present (avoids d3 "node not found").
    const present = nextById
    const safeLinks = links
      .filter((l) => present.has(l.source) && present.has(l.target))
      .map((l) => ({ source: l.source, target: l.target }))

    this.sim.nodes(this.#nodes)

    // Cohesion dial: at 0 the recency × engagement axes dominate and links are a
    // whisper (the axis anchor OUTWEIGHS the edges, so reply/topic edges can't
    // drag the graph into a central knot); at 1 strong links + charge pull
    // connected posts into clumps and the axes go slack. Everything in between is
    // a smooth blend, not a switch.
    const k = Math.max(0, Math.min(1, cohesion))
    ;(this.sim.force('x') as ForceX<SimNode>).strength(0.18 - 0.16 * k)
    ;(this.sim.force('y') as ForceY<SimNode>).strength(0.18 - 0.16 * k)
    this.sim.force(
      'link',
      forceLink<SimNode, SimLink>(safeLinks)
        .id((d) => d.id)
        .distance(60 - 14 * k)
        .strength(0.02 + 0.53 * k),
    )
    this.sim.force('charge', k > 0.05 ? forceManyBody<SimNode>().strength(-30 * k) : null)
    this.sim.alpha(0.7).restart()
  }

  /** Hold a node at (x, y) while the user drags it; keeps the sim warm so
   * neighbors flow around it. */
  dragTo(id: string, x: number, y: number) {
    const n = this.#byId.get(id)
    if (!n) return
    n.fx = x
    n.fy = y
    n.x = x
    n.y = y
    this.sim.alphaTarget(0.12).restart()
  }

  /** End a drag: cool the sim; release the node unless it should stay fixed
   * (i.e. it was pinned by the drop). */
  dragEnd(id: string, keepFixed: boolean) {
    this.sim.alphaTarget(0)
    const n = this.#byId.get(id)
    if (n && !keepFixed) {
      n.fx = null
      n.fy = null
    }
  }

  positions(): Map<string, { x: number; y: number }> {
    const out = new Map<string, { x: number; y: number }>()
    for (const n of this.#nodes) out.set(n.id, { x: n.x ?? n.tx, y: n.y ?? n.ty })
    return out
  }

  stop() {
    this.sim.stop()
  }
}
