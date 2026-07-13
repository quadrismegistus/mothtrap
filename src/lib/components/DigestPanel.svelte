<script lang="ts">
  import { digest } from '../state/digest.svelte'
  import { convoColor, exemplars, MODELS, type Conversation } from '../api/llm'
  import { reposter } from '../api/post'
  import type { FeedItem } from '../api/timeline'
  import { AppBskyFeedPost } from '@atproto/api'

  interface Props {
    /** The feed items currently in the graph, for exemplar lookup. */
    items: FeedItem[]
    onclose: () => void
    onsummarize: () => void
    onfocus: (uri: string) => void
  }
  const { items, onclose, onsummarize, onfocus }: Props = $props()

  const byUri = $derived(new Map(items.map((i) => [i.post.uri, i])))
  const convos = $derived(digest.digest?.conversations ?? [])

  function text(item: FeedItem): string {
    const rec = item.post.record
    return AppBskyFeedPost.isRecord(rec) ? rec.text : ''
  }
  const statusMark: Record<Conversation['status'], string> = {
    heating: '▲',
    cooling: '▼',
    steady: '■',
  }
</script>

<aside class="panel">
  <header>
    <strong>Conversations</strong>
    <button class="x" onclick={onclose} title="Close">✕</button>
  </header>

  <div class="controls">
    <label class="field">
      <span>Anthropic key</span>
      <input
        type="password"
        placeholder="sk-ant-… (kept in memory only)"
        bind:value={digest.apiKey}
        autocomplete="off"
      />
    </label>
    <div class="row">
      <select bind:value={digest.model}>
        {#each MODELS as m}
          <option value={m.id}>{m.label}</option>
        {/each}
      </select>
      <button class="go" onclick={onsummarize} disabled={digest.loading || items.length === 0}>
        {digest.loading ? 'Reading…' : digest.digest ? 'Re-summarize' : 'Summarize'}
      </button>
    </div>
    <p class="note">
      Sends the {items.length} posts in view to Anthropic. The key stays in this tab's memory only
      (re-enter next session); without one, a demo digest is shown.
    </p>
  </div>

  {#if digest.error}
    <p class="err">{digest.error}</p>
  {/if}

  {#if convos.length === 0 && !digest.loading}
    <p class="empty">No digest yet — press Summarize.</p>
  {/if}

  <ul class="convos">
    {#each convos as c (c.id)}
      <li>
        <div class="head" style="--c: {convoColor(c.id)}">
          <span class="swatch"></span>
          <span class="title">{c.label}</span>
          <span class="status {c.status}" title={c.status}>{statusMark[c.status]}</span>
          <span class="count">{c.postUris.length}</span>
        </div>
        <p class="summary">{c.summary}</p>
        <ul class="exemplars">
          {#each exemplars(c, byUri) as ex (ex.post.uri)}
            <li>
              <button class="ex" onclick={() => onfocus(ex.post.uri)}>
                <span class="who">@{ex.post.author.handle}{reposter(ex) ? ' ↻' : ''}</span>
                <span class="body">{text(ex).slice(0, 120)}</span>
              </button>
            </li>
          {/each}
        </ul>
      </li>
    {/each}
  </ul>
</aside>

<style>
  .panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 340px;
    max-width: 88vw;
    background: var(--bg-elev);
    border-left: 1px solid var(--border);
    box-shadow: -10px 0 30px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    z-index: 20;
    font-size: 0.85rem;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.8rem 0.9rem;
    border-bottom: 1px solid var(--border);
  }
  .x {
    background: transparent;
    border: none;
    color: var(--text-dim);
    font-size: 0.9rem;
    cursor: pointer;
  }
  .controls {
    padding: 0.8rem 0.9rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .field span {
    color: var(--text-dim);
    font-size: 0.72rem;
  }
  .field input,
  select {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 0.35rem 0.5rem;
    color: var(--text);
    font-size: 0.8rem;
  }
  .row {
    display: flex;
    gap: 0.5rem;
  }
  .row select {
    flex: 1 1 0;
    min-width: 0;
  }
  .go {
    flex: none;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 7px;
    padding: 0.35rem 0.8rem;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .go:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .note {
    margin: 0;
    color: var(--text-dim);
    font-size: 0.68rem;
    line-height: 1.4;
  }
  .err {
    margin: 0;
    padding: 0.6rem 0.9rem;
    color: var(--danger);
    font-size: 0.75rem;
  }
  .empty {
    padding: 1rem 0.9rem;
    color: var(--text-dim);
  }
  .convos {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    flex: 1 1 0;
  }
  .convos > li {
    padding: 0.7rem 0.9rem;
    border-bottom: 1px solid var(--border);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: var(--c);
    flex: none;
  }
  .title {
    font-weight: 600;
    flex: 1 1 0;
    min-width: 0;
  }
  .status {
    font-size: 0.7rem;
  }
  .status.heating {
    color: var(--danger, #e0684f);
  }
  .status.cooling {
    color: var(--text-dim);
  }
  .status.steady {
    color: var(--text-dim);
  }
  .count {
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
    font-size: 0.75rem;
  }
  .summary {
    margin: 0.3rem 0 0.4rem;
    color: var(--text);
    line-height: 1.4;
  }
  .exemplars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .ex {
    display: block;
    width: 100%;
    text-align: left;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    color: var(--text);
  }
  .ex:hover {
    border-color: var(--accent);
  }
  .ex .who {
    display: block;
    color: var(--text-dim);
    font-size: 0.7rem;
    margin-bottom: 0.1rem;
  }
  .ex .body {
    display: block;
    font-size: 0.75rem;
    line-height: 1.35;
  }
</style>
