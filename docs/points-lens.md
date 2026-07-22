# The points map + thread lens

How Mothtrap draws the timeline, and why. All of this lives in
`src/lib/components/Graph.svelte` unless noted.

## The idea

One triangle kept fighting itself: **truthful axes** (a post at its real
time/engagement), **legible reply trees**, and **stillness under triage**
(dismiss/next must not reshuffle the field). Any design gets two.

The resolution: **the map is a truthful scatter; the thread is a temporary
lens; the batch is the unit of layout.**

## The scatter (resting map)

Every visible post sits at its true `(timeRank, engagementRank)` — no tree
geometry bends a reply's position. Avatars, or reader "pills" (`settings.postNodes`).

- **Batch** — one set of posts is captured from the plan (complete conversation
  memberships) and laid out once; it only **drains** as you dismiss. Live-poll
  arrivals and later pages pool invisibly for the next batch; a refill happens
  only when the batch empties (`total === 0`) — the one expected reflow. Capture
  waits for a measured frame (`w,h > 0`) and a stocked pool.
- **Ranks are frozen per batch** (`positionsFrozenTime` against a captured
  baseline), so a survivor never moves as the batch drains. The re-solve
  `$effect` skips entirely on a pure shrink (a dismissal moves nothing);
  newcomers pin-and-solve.
- **Reply context is one hop.** `visibleNodes` keeps each feed post (plus reps /
  pinned / mapped) and only its **immediate** display-parent — never the deep
  ancestry. The full thread is the lens. (`connectReplies` draws these edges;
  fully off = standalone posts.)
- **Edges are annotation** — whispered at rest, lit on hover/lens; they never
  drive position.

## The thread lens

Click any post that's part of a thread (`focusChain`) → the conversation gathers
into a tidy tree centre-stage while non-members fly off-frame; background tap
releases and everyone flies home (the solver is deterministic, so release
restores exact positions by construction).

- **Membership** is root-based (`focusMembers`): every on-map node sharing the
  thread root, including ghosts of dismissed ancestors. `fetchThread` pulls the
  parts your feed never surfaced as **lens-only guests**.
- **Sibling cap** (`lensPack`, `LENS_SIBLING_CAP = 2`): at most N direct replies
  per post; the rest collapse to a "+K more" node that reveals `LENS_SIBLING_STEP`
  at a time. The clicked post's spine is always kept.
- **Layout** is `treeTargets` block layout with **variable per-node heights**
  (rows stack by pixel span; reduces exactly to the old uniform layout when no
  height is given). "+K more" markers are `slim` (narrow column + collision box).
- **Dismiss in the lens = the whole thread** (`dismissThread`); rating marks only
  (no dismiss — you're reading).

## The lens card = a real PostCard

Lens nodes render the actual `PostCard` in its `node` variant (full header with
working follow + profile-hover, rich text, inline images/quotes/link cards, the
action row). So the tree shows what a post *is*, not a summary.

- **Height** is measured, not estimated: each card is `height: auto` (capped at
  `READER_MAX_H`, scroll beyond) and reports its rendered height
  (`onmeasure → measuredHeights`); the packer reserves exactly that. Because the
  packer's height and the render height are the same number, the estimate is only
  a first-frame fallback and can never cause overlap. The measure→repack loop
  converges (height is width-determined, position-independent).
- **Popovers** (profile hover, ⋯ menu) are `use:portal`-ed to `<body>` so
  `position: fixed` escapes the graph's pan/zoom transform.

## Invariants worth not breaking

- Freeze the **solve**, not just the targets (a dismissal must not reshuffle).
- The solver is deterministic — identical input reproduces identical output; that
  is the lens's restore guarantee.
- Variable-height `treeTargets` must reduce exactly to the uniform layout when no
  `height` is supplied (the `graph.test.ts` suite guards this).
