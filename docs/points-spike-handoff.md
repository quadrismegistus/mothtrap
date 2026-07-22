# Points-layout spike — handoff

**Branch:** `spike/points-layout`, off `main` (d6d989f). All work in `src/lib/components/Graph.svelte` unless noted. Working tree = Ryan's dev server (HMR). Status: **model proven, in refinement**; next milestone is graduation to main.

## Why this exists (the design argument)

Mothtrap kept failing on one triangle — it wanted all three, any design gets two:

1. **Truthful axes** — a post at its real (time, engagement).
2. **Legible reply trees** — conversations drawn as structure.
3. **Stillness under triage** — dismiss/next must not reshuffle the field.

The old `treeTargets` world split 1/2 (cat-monster, wrap pathologies). The stable-world spike (`spike/stable-world`, folded, deletable) tried 2/3 and lost the axes; its surviving lesson: *freezing targets isn't enough — freeze the SOLVE*. The resolution (Ryan's, from use): drop trees from the resting map entirely.

> **The map is a truthful scatter. Trees are a temporary lens. The batch is the unit of layout.**

## The model

- **Scatter:** every visible post at `(timeRank, engagementRank)`, ranked **within the batch** against a **frozen baseline**; sizeRank drives avatar r (pills uniform). No reservoir; budget plans the frame only (`pillBudgetBase(fw, fh, cell, 0, 0, 0)`).
- **Batch:** `batch: Set<uri>` captured from the plan's chosen conversations (**complete memberships**, so collapsed reps keep +N). `visible` filters to it → the set only **drains**; poll arrivals/pages pool invisibly for next batch. Refill on `total === 0` → the one *expected* reflow. Capture waits for pool ≥ budget (or feed exhausted). Auto-load gated to `batch === null`. Feed switch resets batch.
- **Baseline:** `baseFor`/`batchCorpus`/`batchDomain`, keyed to batch **object identity**, captured lazily inside the `nodeLayout` derived (same pattern as `timeDomain`). `positionsFrozenTime(visibleNodes, batchCorpus, batchDomain)`, x stretched by `1/(1 - NEW_TAIL)` (NEW_TAIL now exported from graph.ts). Mid-batch joiners rank against the frozen arrays → slot in without moving anyone.
- **Solve freeze:** in the re-solve `$effect`: `solvedFor`/`solvedSig`/`solvedBatch`. `sig = w|h|bottomChrome|showDigest|pill.w|focusedThread|g<guestCount>`. Same batch + same sig: **pure shrink → skip `layout.update` entirely** (dismiss moves nothing); newcomers → pin-and-solve (hold all placed). Sig or batch change → full solve. **The solver is deterministic — full solve of identical input reproduces identical output. This is the lens's restore guarantee. Don't break it.**
- **Edges = annotation, never force.** All reply edges drawn; `.edges path` opacity **0.18** at rest, `.lit` **0.95** (140ms fade). Lit = hovered chain (`hoveredChain`, conversation of `hovered`) ∪ lens (`lensUris`). Members of lit sets get the `related` soft ring (PostNode prop).
- **Topics:** hub nodes **retired** (`topicTargets`/`topics` return empty; the old code is in git history). Every topic member wears a caption (`topicView` captions all pill members) + border tint (`topicColorByNode` unchanged). Topic verbs (reveal, dismiss-topic) live only in the digest panel now.
- **Focus lens:** click a post → `focusChain(uri)` → `focusedThread` (conversation id). Then:
  - `focusMembers` → member display-uris (≥2 else null).
  - `lensGuests`: `$effect` fetches `fetchThread(rootUriOf(member))` (`src/lib/api/thread.ts`, depth 6 / parentHeight 20), cached in `lensCache` per root; failed fetch retries on refocus. **Guests are lens citizens only** — never in batch/baseline/plan/scatter (Ryan chose this explicitly over scatter citizenship).
  - `guestNodes`: guests minus displayed (`visibleUris`, `graph.memberNode`) minus dismissed (dismissing a guest removes it live; the persisted dismissal is intended).
  - `lensTree`: `treeTargets` over members+guests, then **translated** to root-top-centre (top row at `PAD_TOP + 28`, bbox centred on x).
  - `focusTargets`: members+guests take tree targets; **non-members exiled radially** to `R = 0.75·hypot(w,h)` past the frame (`lensBleed = 0.8·hypot` in `setBounds` legalizes the ring). Their scatter targets are untouched → release restores exactly.
  - `lensEdges`: guest→parent, guest→guest, member→guest; concatenated into `edgeLines`.
  - `placed` appends guest placements (hover cards, entrance animation, keyboard all work on them).
  - Release: background pointerdown (`onCanvasPointerDown`) or clicking a chainless post. Clicking **inside** the lens (member or guest) keeps it open — the `lensUris` guard in `focusChain`; guests belong to no batch conversation, so without the guard the lookup would wrongly release.
- **Click-to-pin retired** (`togglePin` kept, unused). Click = lens only; cards ride hover. Touch tap unchanged.

## Ryan's locked judgments — don't relitigate

- **No pill resizing** (built, rejected, reverted eded0db): size duplicates the axes. Pills stay uniform; legibility must come from position/whitespace.
- **Topic hubs gone is fine** — "topic groups were rare and you can still see them in the digest view."
- **Linear chains render as verticals** — that's honest; branchiness comes from lens guests.
- **Guests = lens-only citizenship** — option 2, chosen over scatter admission.

## Known gaps / TODO

- **e2e:** "dismiss backfills to keep the visible count" fails **by design** (batch drains). Rewrite for the batch model at graduation; add lens coverage.
- **No "N waiting" indicator** — poll arrivals pool silently. Small pill wanted eventually.
- **Undo-last at the refill boundary** — undoing the batch's final dismiss after refill won't resurrect the post into the new batch (it returns via a future batch).
- **Map-replies (`toggleMapReplies`) fetched posts are blocked by the batch filter** (not batch members). Partially broken in batch world; the lens largely supersedes it — decide at graduation.
- **Pill-mode texture** — "rows of pills" concern is only partly resolved by batch-rank spread; density slider is the honest lever. Avatar mode is the stronger scatter.
- **Big threads in the lens** — wrap budgets (0.6·frame) contain moderate fans; a monster thread may overflow bottom. Options: scale, scroll, or cap guest depth.
- **Guest marker** — nothing distinguishes guests from members inside the lens (beyond unfollowed styling). Undecided whether it matters.
- **Lens fetch beat** — members gather, guests arrive on fetch (second reflow). If janky: hold the gather until fetch settles, or show a "fetching thread…" whisper.
- **PRs:** #103 close (pan removal + points supersede it). #104 hold — its lift math lives in `withTopicPills`, which the map no longer calls; the salience idea could return in a pill-anchor calc if hubs ever return.
- **Branches:** `spike/stable-world` and `feat/docket-inbox` are folded/superseded — delete after graduation.

## Graduation checklist

1. Ryan declares the model right (near — the lens fly-away round was the last big piece).
2. Decide: points-as-only-mode vs. settings flag (lean: only-mode; the old world's machinery — reservoir, treeTargets-at-rest, topic hubs — otherwise survives as dead weight).
3. Rewrite affected e2e; unit tests for batch capture/refill and lens restore.
4. Re-examine retired verbs: pin gesture (some users want a held card), topic verbs on captions.
5. "N waiting" pill; undo-at-boundary decision.
6. Squash-or-narrate the spike into a PR to main; update memory (`skynets-points-layout`, `skynets-deterministic-layout`); close/retag issues (#103, #104); delete dead branches.

## Commit ledger (this branch)

aa6c316 points layout · fbaa06c batch model · f5f6afc freeze-the-solve · 5a26561/eded0db pill-resize built+reverted · 970db08 hover-chain · 2a98e2f always-on edges · dc1bc15 whisper/lit · 1638057 topic hubs retired · bf0d4c3 focus lens · 29e5faf pin retired · 5ac7ac4 lens guests · 599e746 fly-away + root-top-centre
