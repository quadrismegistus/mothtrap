<script lang="ts">
  import type { FeedItem } from '../api/timeline'
  import { interactions } from '../state/interactions.svelte'
  import { moderation } from '../state/moderation.svelte'
  import { report } from '../state/report.svelte'
  import { session } from '../state/session.svelte'

  // The post action row — reply / repost+quote / like (with counts) / ⋯ menu —
  // extracted so the reader-lens card and the post card render the identical
  // thing in the identical style. `showVotes` appends the private up/down triage
  // arrows (reader lens), which the caller wires to its own vote handler.
  interface Props {
    item: FeedItem
    compact?: boolean
    /** Append the private up/down vote arrows (reader lens). */
    showVotes?: boolean
    /** Current vote, for the arrow highlight. */
    vote?: 'up' | 'down'
    onreply: (item: FeedItem) => void
    onquote: (item: FeedItem) => void
    onvote?: (item: FeedItem, kind: 'up' | 'down') => void
  }
  let { item, compact = false, showVotes = false, vote, onreply, onquote, onvote }: Props = $props()

  const liked = $derived(interactions.liked(item))
  const reposted = $derived(interactions.reposted(item))
  const isSelf = $derived(item.post.author.did === session.did)
  const muted = $derived(moderation.isMuted(item.post.author))
  const blocked = $derived(moderation.isBlocked(item.post.author))

  let repostMenu = $state(false)
  let moreMenu = $state(false)
  // ⋯ menu is FIXED-positioned (the card/node clips absolute children) and flips
  // above the button when opening near the topbar would slide it underneath.
  const TOPBAR_SAFE = 56
  let moreAnchor = $state<{ left: number; top: number; bottom: number } | null>(null)
  let moreMenuH = $state(0)
  const moreMenuUp = $derived(!moreAnchor || moreAnchor.top - moreMenuH - 6 > TOPBAR_SAFE)
  const moreMenuPos = $derived(
    moreAnchor
      ? { left: moreAnchor.left, top: moreMenuUp ? moreAnchor.top - 6 : moreAnchor.bottom + 6 }
      : { left: 0, top: 0 },
  )
  function toggleMore(e: MouseEvent) {
    if (moreMenu) {
      moreMenu = false
      return
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    moreAnchor = { left: r.left + r.width / 2, top: r.top, bottom: r.bottom }
    moreMenu = true
  }
  let modError = $state<string | undefined>(undefined)
  async function runModAction(fn: () => Promise<void>) {
    modError = undefined
    moreMenu = false
    try {
      await fn()
    } catch (err) {
      modError = err instanceof Error ? err.message : 'That didn’t work'
    }
  }

  const REPLY =
    'M12 4C6.9 4 3 7.2 3 11.2c0 2 1 3.9 2.7 5.2-.1 1.3-.7 2.6-1.7 3.6 1.6-.1 3.3-.7 4.6-1.6 1.1.3 2.2.5 3.4.5 5.1 0 9-3.2 9-7.3C21 7.2 17.1 4 12 4z'
  const REPOST =
    'M17 4l3.2 3.2-3.2 3.2V8.2H9A1.8 1.8 0 007.2 10v1.6H5.2V10A3.8 3.8 0 019 6.2h8V4zM7 20l-3.2-3.2L7 13.6v2.2h8a1.8 1.8 0 001.8-1.8v-1.6h2v1.6A3.8 3.8 0 0115 17.8H7V20z'
  const HEART =
    'M12 20.7l-1.3-1.2C6 15.3 3 12.6 3 9.2 3 6.5 5.1 4.5 7.8 4.5c1.5 0 3 .7 3.9 1.9.9-1.2 2.4-1.9 3.9-1.9C18.4 4.5 20.5 6.5 20.5 9.2c0 3.4-3 6.1-7.7 10.4L12 20.7z'
</script>

<!-- Stop pointerdown escaping to a host that drag-tracks (the graph node). -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="actions" class:compact class:with-votes={showVotes} onpointerdown={(e) => e.stopPropagation()}>
  <button class="act" title="Reply" onclick={() => onreply(item)}>
    <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d={REPLY} fill="currentColor" /></svg>
    <span>{item.post.replyCount ?? 0}</span>
  </button>

  <div class="repost-wrap">
    <button
      class="act"
      class:on={reposted}
      title="Repost or quote"
      onclick={() => (repostMenu = !repostMenu)}
    >
      <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d={REPOST} fill="currentColor" /></svg>
      <span>{interactions.repostCount(item)}</span>
    </button>
    {#if repostMenu}
      <div class="menu">
        <button
          onclick={() => {
            interactions.toggleRepost(item)
            repostMenu = false
          }}>{reposted ? 'Undo repost' : 'Repost'}</button
        >
        <button
          onclick={() => {
            onquote(item)
            repostMenu = false
          }}>Quote post</button
        >
      </div>
    {/if}
  </div>

  <button
    class="act like"
    class:on={liked}
    title={liked ? 'Unlike' : 'Like'}
    onclick={() => interactions.toggleLike(item)}
  >
    <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
      <path d={HEART} fill={liked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width={liked ? 0 : 1.8} />
    </svg>
    <span>{interactions.likeCount(item)}</span>
  </button>

  <div class="more-wrap">
    <button class="act more" title="Report, mute or block" aria-label="More actions" onclick={toggleMore}>⋯</button>
    {#if moreMenu}
      <div
        class="menu floating"
        class:up={moreMenuUp}
        bind:clientHeight={moreMenuH}
        style="left: {moreMenuPos.left}px; top: {moreMenuPos.top}px;"
      >
        <button
          onclick={() => {
            report.show(item)
            moreMenu = false
          }}>Report post</button
        >
        {#if !isSelf}
          <button onclick={() => runModAction(() => (muted ? moderation.unmute(item.post.author) : moderation.mute(item.post.author)))}>
            {muted ? 'Unmute' : 'Mute'} @{item.post.author.handle}
          </button>
          <button
            class="danger"
            onclick={() => runModAction(() => (blocked ? moderation.unblock(item.post.author) : moderation.block(item.post.author)))}
          >
            {blocked ? 'Unblock' : 'Block'} @{item.post.author.handle}
          </button>
          <button
            onclick={() => {
              report.show(item, 'account')
              moreMenu = false
            }}>Report account</button
          >
        {/if}
      </div>
    {/if}
  </div>

  {#if showVotes && onvote}
    <button
      class="act vote up"
      class:on={vote === 'up'}
      title="Upvote — private, on-device only"
      aria-label="Upvote"
      onclick={() => onvote?.(item, 'up')}
    >
      <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5l7 11H5z" fill="currentColor" /></svg>
    </button>
    <button
      class="act vote down"
      class:on={vote === 'down'}
      title="Downvote — private, on-device only"
      aria-label="Downvote"
      onclick={() => onvote?.(item, 'down')}
    >
      <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19l7-11H5z" fill="currentColor" /></svg>
    </button>
  {/if}
</div>

{#if modError && !compact}<p class="mod-error">{modError}</p>{/if}

<style>
  .actions {
    display: flex;
    gap: 0.5rem;
  }
  .actions.compact {
    gap: 0.3rem;
  }
  .act {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.3rem 0.4rem;
    font-size: 0.8rem;
    line-height: 1;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--text-dim);
    cursor: pointer;
  }
  .actions.compact .act {
    padding: 0.15rem 0.3rem;
    font-size: 0.7rem;
  }
  .ic {
    width: 17px;
    height: 17px;
    display: block;
    flex-shrink: 0;
  }
  .actions.compact .ic {
    width: 13px;
    height: 13px;
  }
  .act span {
    font-variant-numeric: tabular-nums;
  }
  .act:hover {
    background: var(--bg);
    border-color: var(--border);
  }
  .act.on {
    color: var(--text);
  }
  .act.like.on {
    color: var(--danger);
  }
  .repost-wrap .act.on {
    color: #4caf7d;
  }
  .repost-wrap {
    position: relative;
    flex: 1;
    display: flex;
  }
  .more-wrap {
    position: relative;
    display: flex;
  }
  .act.more {
    flex: none;
    min-width: 2rem;
    font-size: 1rem;
    line-height: 1;
    letter-spacing: 0.05em;
  }
  /* Private up/down vote arrows (reader lens). Never sent to Bluesky. */
  .act.vote {
    flex: none;
    min-width: 2rem;
  }
  .act.vote.up.on {
    color: #3fb950;
    border-color: #3fb950;
    background: rgba(63, 185, 80, 0.14);
  }
  .act.vote.down.on {
    color: var(--danger);
    border-color: var(--danger);
    background: rgba(229, 72, 77, 0.14);
  }
  .menu {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    padding: 0.25rem;
    z-index: 200;
  }
  .menu.floating {
    position: fixed;
    bottom: auto;
    z-index: 900; /* over the topbar and graph, under the modals (1000) */
  }
  .menu.floating.up {
    transform: translate(-50%, -100%);
  }
  .menu button {
    background: transparent;
    border: none;
    border-radius: 6px;
    text-align: left;
    white-space: nowrap;
    padding: 0.4rem 0.7rem;
    font-size: 0.82rem;
    color: var(--text);
    cursor: pointer;
  }
  .menu button:hover {
    background: var(--bg);
  }
  .menu button.danger {
    color: var(--danger);
  }
  .mod-error {
    margin: 0.35rem 0 0;
    font-size: 0.78rem;
    color: var(--danger);
  }
</style>
