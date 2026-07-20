# Replacing the force simulation with a deterministic solver

**Status: built**, on `feat/deterministic-layout` (2026-07-19). This document
was the plan; it now records what was built and where reality differed.

## Why

Two symptoms, reported from use: the graph **flickered on load**, and there was
**friction when new posts arrived** — things shuffled for seconds after any
change.

Both came from the same place. `settings.cohesion` defaulted to `0` and was
never moved in practice, and at 0 the simulation ran only a pull toward each
node's semantic target, a link force at whisper strength, and a collision pass
that was already our own. d3 contributed nothing a deterministic solver could
not compute exactly — it just arrived there slowly, via `alphaDecay(0.012)`,
about seven seconds of easing. That easing was the flicker and the friction.

Meanwhile the layout had grown a constraint solver alongside the simulation
(`rectCollide`, `#separateGroups`, `#unstraddleGroups`, `#clamp`) that set
positions directly and fought the sim for the same coordinates every tick.

## What was built

`src/lib/state/layout.ts` — class `Layout`, same surface as the old
`ForceLayout` minus the simulation. One synchronous pipeline:

```
1. seed every node at its semantic target      (lone targets edge-resolved;
                                                grouped targets left raw — see below)
2. hold whole conversations apart              (#separateGroups)
3. keep each conversation on one edge side     (#unstraddleGroups)
4. relax pairwise collisions to a fixed point  (#relax — rectCollide's body,
                                                velocity space → position space,
                                                ≤50 passes or worst move < 0.5px)
5. clamp to the world, never slicing an edge   (#clamp)
```

`update()` returns with positions final. **Motion is a render concern**:
`Graph.svelte` tweens the previously painted positions to each new answer over
400ms (rAF + ease-out cubic — deliberately not CSS transitions, which made
every node permanently "unstable" to Playwright once before). The tween is
skipped on the first paint (easing the whole graph in from nothing WAS the
load flicker), during drags (neighbours must track the pointer live, via a
re-solve per pointermove), for sub-pixel changes, and under reduced motion.

Free nodes carry **no history** — same targets, same layout, and re-solving
identical targets moves nothing. Only pinned and dragged nodes keep their
positions; groups containing one are held still and everything else resolves
around them. Both properties are unit-tested invariants now
(`layout.test.ts`, 19 tests, ~4ms — the old file needed hundreds of
hand-driven ticks).

### Departures from the plan

- **Both modes at once, not pill-first.** Keeping d3 for avatar mode meant
  keeping both systems and the contested-coordinates bug class the rewrite
  exists to kill. Avatar mode is the same math with circles, and the circular
  relaxation is simpler than the rectangular one.
- **Grouped targets are no longer edge-resolved one at a time in seed.** The
  shipped code did this and it tore a tree's shape at the frame edge (members
  resolved to opposite sides) before the group passes re-cohered it by force.
  Trees now resolve only as trees; there is a test asserting the internal
  geometry survives edge resolution exactly.
- **Content edge ≠ window edge** (found by the boundary probe, live): a group
  pushed "out" past the content edge (`h` minus the chrome keep-out) parked in
  the visible margin band with its body run off the bottom of the window —
  out of the layout's frame, sliced on the reader's screen. `#resolveBand` now
  takes both edges: *in* means clear of the chrome, *out* means past the
  window. This latent bug predates the solver (the clamp code was shared) and
  is very plausibly the "2 sliced conversations" never explained on
  `feat/stable-x-axis`.
- **Pinned members anchor their conversation** (`#anchorHeldGroups`, added
  from use): revealing a topic pill pins it where it was clicked, but the
  members' tidy-tree targets sit at the conversation's semantic spot — the
  pinned root stayed put while its children seeded across the canvas, edges
  stretched corner to corner. A group with a pinned member now shifts its
  targets so the tree arranges itself around the pin; the semantic ranks
  survive as the tree's internal arrangement. Dragging a pinned pill moves
  the whole conversation with it.
- `untrack()` around the solve→paint callback: paint reads `positions` to
  decide whether to tween and is called synchronously inside the update
  effect — untracked, that read-write is a dependency cycle
  (`effect_update_depth_exceeded`, the third time this class of bug appeared).

## What was removed

- `d3-force` entirely (dependency deleted)
- The cohesion slider and `settings.cohesion` (confirmed unused; the v1
  persistence migration still strips the stale key). If clumping is ever
  wanted back it belongs as a pre-pass that adjusts *targets*, not as a force.
- `alphaDecay` / `velocityDecay` / `step()` / reheat, and the `Math.random()`
  jitter in arrival seeding (a pure solver must be deterministic)

## Verification (real signed-in timeline, 1280×820)

| Measure | `main` baseline | solver |
|---|---|---|
| Posts whole in frame | 19 | 16 |
| Parked in reservoir | 2 | 5 |
| Sliced by the frame edge | 0* | 0 |
| Reply edges crossing the boundary | 0 | 0 |
| Settling travel | 533px/post | 396px/post |
| Arrivals gliding (vs popping) | 6/6 | 3/3 |

\* the first solver run showed 1 sliced — the margin-band bug above, which
main also has latently; the fixed solver shows 0.

Whole/parked counts are different *timelines* (different days), not a
regression signal. The settle number needs its usual caveat squared: motion
now comes in discrete bursts — each one a data change (feed page, digest
topics, backfill) followed by one 400ms glide — with dead-zero stretches
between, where the sim used to jostle continuously. The metric sums both the
same. Eyes beat the number; the screenshots and the flicker judgment are the
user's call.

One probe artifact worth remembering: headless runs show a post card opening
with zero interaction, on main and solver builds alike. Playwright's login
click parks the virtual mouse mid-screen, and Chromium re-evaluates hover with
a synthetic mousemove when content moves under a static cursor. Not a real-use
behaviour; not worth chasing.

## Related state

- **Frozen time axis — revived on the solver (was `feat/stable-x-axis`).**
  Freezes x so backfill stops re-ranking every node's column; y/engagement stays
  live (freezing `score`, a decaying rate, sank the whole population — see the
  commit). Re-measured signed-in on the solver (pill mode): settle churn
  **277px/post vs 863** on relative-x main (a 68% cut), and the density penalty
  that blocked the original branch is **gone** — 14 whole / 12 hidden / **1
  sliced** vs main's 14/11/**2**. So the "2 mystery sliced conversations" WERE
  the margin-band clamp bug the solver fixed, as suspected. Scoped to
  reservoir/pill mode (`bleed.x`); avatar mode still ranks relative, pending its
  own measurement (a fast-follow). The domain snapshot is a plain variable
  captured in the derived, not `$state`: both an effect that replaces it and a
  version counter re-introduced `effect_update_depth_exceeded`.
- PR #38 — merged. Pill mode, the reservoir, pan/zoom, tree cohesion, the
  render-layer arrival animation (whose success predicted the tween approach).
