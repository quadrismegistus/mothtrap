# Replacing the force simulation with a deterministic solver

**Status: provisional.** A plan, not a decision. Nothing here has been built.
Written at the end of a long session so the next one starts from the diagnosis
rather than rediscovering it.

## Why

Two symptoms, reported from use: the graph **flickers on load**, and there is
**friction when new posts arrive** — things shuffle for seconds after any
change.

Both come from the same place. `settings.cohesion` defaults to `0` and is never
moved in practice, and at 0 the simulation runs:

- `forceX` / `forceY` toward each node's semantic target — strength `0.18`
- `forceLink` at strength `0.02` (the comment in `forceLayout.ts` calls it "a
  whisper")
- `forceManyBody` — `null`, not registered at all below `k = 0.05`
- `collide` — which in pill mode is already **our** `rectCollide`, not d3's

So at the default setting d3 contributes nothing a deterministic solver cannot
compute exactly. It just arrives there slowly, via `alphaDecay(0.012)` — about
seven seconds of easing. That easing is the flicker and the friction.

Meanwhile the layout has grown a constraint solver alongside the simulation:
`rectCollide`, `#separateGroups`, `#unstraddleGroups`, `#clamp`. These are not
forces. They set positions directly and overwrite whatever the sim decided. The
two systems contest the same coordinates, and the constraint layer wins — which
is why `step()` had to exist for tests (ticking d3 without clamping produces
positions the app never renders), and why three separate attempts to animate
arrivals by seeding the simulation all failed: the constraint layer overrode the
seed every time. The render-layer animation worked first try precisely because
it sits outside both systems.

## The shape

Lift what already exists into one pure function, and drive it directly.

```
solve(targets, links, bounds) → Map<uri, {x, y}>
  1. seed at semantic targets       — treeTargets, already deterministic
  2. relax rectangular collisions   — rectCollide's body, iterated to converge
  3. separate conversations         — #separateGroups, already written
  4. resolve the frame edge         — #unstraddleGroups, already written
  5. clamp to the world             — #clamp, already written
```

Then: **solve once, paint the answer, animate the delta.** Motion becomes a
render concern — interpolate from the previously painted positions to the solved
ones over ~400ms. The arrival animation already does exactly this and is the one
piece of motion work in this area that worked on the first attempt.

This is an extension, not a rewrite. Steps 2–5 are written, tested, and shipped.
What changes is that they stop being applied piecemeal around a simulation that
keeps disturbing them.

## What is removed

- `d3-force` entirely — `forceSimulation`, `forceX/Y`, `forceLink`,
  `forceManyBody`, `forceCollide`, and the tick loop
- The cohesion slider, and `settings.cohesion` with it. **Confirmed unused**
  (kept at 0). This is the only genuinely emergent behaviour being given up:
  above `k = 0.05` the n-body charge produces clumping a solver would have to
  approximate rather than reproduce. If it is ever wanted back, it belongs as a
  pre-pass that adjusts *targets* (pull children toward parents by a fraction),
  not as an ongoing force.
- `alphaDecay`, `velocityDecay`, `step()`, and the reheat logic

## What this buys beyond the symptoms

**Testability.** Every defect the three PR reviewers found lived in code whose
correctness could only be checked by screenshot or by a credentialed browser
harness. A pure function with fixed iterations is testable in milliseconds.
`forceLayout.test.ts` already covers the constraint passes; the solver inherits
those tests almost unchanged.

**No more contested coordinates.** One system owns positions. The recurring
class of bug this session — seed something, watch another pass overwrite it —
stops being possible.

## Risks and open questions

- **Convergence.** Relaxation may not fully resolve dense arrangements in fixed
  iterations. Needs a measured iteration budget and a documented failure mode
  (leave the overlap, do not loop).
- **Feel.** The organic settle may be missed. Mitigation: the delta animation is
  a tuning knob, and easing between solved states may read better than watching
  a simulation negotiate.
- **Drag.** Pin the dragged node and re-solve with it fixed. Re-solving per
  pointer move needs a measured cost; there are ~20 nodes in pill mode.
- **Scope.** Pill mode first, or avatar mode too? Avatar mode is what is live on
  mothtrap.blue, so pill-first is the safer order.
- **Two conversations end up sliced** on `feat/stable-x-axis` (see below) and the
  cause is unknown. Worth establishing whether the solver makes it moot before
  chasing it separately.

## Verification

The harness is `scripts/measure-graph.mjs`, which needs a real signed-in
timeline — the demo fixture cannot answer these questions (27 posts against ~21
planned gave corpus-wide ranking nothing to rank over, and it returned
byte-identical numbers across changes that mattered).

Baselines to beat, all measured on a real 79-post timeline:

| Measure | Current (`main`) |
|---|---|
| Posts whole in frame | 19 |
| Sliced by the frame edge | 0 |
| Reply trees split across the edge | 0 |
| Settling travel | 533px per post |

The solver should take settling travel to approximately **zero** — there is
nothing to settle — while holding the other three.

Note the settle metric sums over visible posts, so a change that shows more
posts reads as more churn. It also cannot distinguish a tree gliding to a
sensible place from one being jostled out of it: it called a genuine improvement
a 39% regression once. Trust your eyes over it when they disagree.

## Related state

- `feat/stable-x-axis` — freezes the time axis only (score decays with
  wall-clock age, so freezing y sank the whole population; timestamps do not).
  Churn 219px/post against 533. **Not merged:** density is 15/4/2 against 19/2/0,
  with two conversations sliced for reasons not yet found. The solver may
  supersede this branch entirely.
- PR #38 — merged. Pill mode, the reservoir, pan/zoom, tree cohesion, the
  render-layer arrival animation.
