<script lang="ts">
  import { compose, buildSelfPost, type ReplyRef } from '../state/compose.svelte'
  import { createPost, graphemeLength, MAX_GRAPHEMES } from '../api/posting'
  import { uploadImage } from '../api/upload'
  import { detectFacets } from '../api/richtext'
  import { authorName, postText } from '../api/post'

  const MAX_IMAGES = 4

  interface Attached {
    file: File
    url: string
    alt: string
  }
  interface Segment {
    text: string
    attached: Attached[]
  }

  let segments = $state<Segment[]>([{ text: '', attached: [] }])
  let posting = $state(false)
  let error = $state<string | undefined>(undefined)
  let dialog = $state<HTMLElement | undefined>(undefined)
  let fileInputs: Record<number, HTMLInputElement | undefined> = {}

  $effect(() => {
    if (compose.open) {
      segments = [{ text: '', attached: [] }]
      error = undefined
      queueMicrotask(() => dialog?.querySelector('textarea')?.focus())
    }
  })

  const isThread = $derived(segments.length > 1)
  const canPost = $derived(
    !posting &&
      segments.every(
        (s) =>
          (s.text.trim().length > 0 || s.attached.length > 0) &&
          graphemeLength(s.text) <= MAX_GRAPHEMES,
      ),
  )

  function addSegment() {
    segments = [...segments, { text: '', attached: [] }]
  }
  function removeSegment(i: number) {
    for (const a of segments[i].attached) URL.revokeObjectURL(a.url)
    segments = segments.filter((_, idx) => idx !== i)
  }

  function onFiles(i: number, e: Event) {
    const input = e.target as HTMLInputElement
    const seg = segments[i]
    for (const f of Array.from(input.files ?? [])) {
      if (seg.attached.length >= MAX_IMAGES) break
      if (!f.type.startsWith('image/')) continue
      seg.attached = [...seg.attached, { file: f, url: URL.createObjectURL(f), alt: '' }]
    }
    input.value = ''
  }
  function removeImage(i: number, j: number) {
    URL.revokeObjectURL(segments[i].attached[j].url)
    segments[i].attached = segments[i].attached.filter((_, idx) => idx !== j)
  }

  function cancel() {
    for (const s of segments) for (const a of s.attached) URL.revokeObjectURL(a.url)
    compose.close()
  }

  async function submit() {
    if (!canPost) return
    posting = true
    error = undefined
    try {
      const reply0 = compose.reply
      const quote0 = compose.quote
        ? { uri: compose.quote.post.uri, cid: compose.quote.post.cid }
        : null
      let root: { uri: string; cid: string } | null = reply0
        ? { uri: reply0.rootUri, cid: reply0.rootCid }
        : null
      let parent: { uri: string; cid: string } | null = reply0
        ? { uri: reply0.uri, cid: reply0.cid }
        : null

      const injected = []
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]
        const replyRef: ReplyRef | null =
          i === 0
            ? reply0
            : { uri: parent!.uri, cid: parent!.cid, rootUri: root!.uri, rootCid: root!.cid }
        const quote = i === 0 ? quote0 : null
        const facets = await detectFacets(seg.text)
        const uploaded = []
        for (const a of seg.attached) uploaded.push(await uploadImage(a.file, a.alt))

        const { uri, cid } = await createPost(seg.text, replyRef, quote, facets, uploaded)
        if (i === 0 && !root) root = { uri, cid }
        parent = { uri, cid }
        injected.push(
          buildSelfPost(
            seg.text,
            uri,
            cid,
            replyRef,
            seg.attached.map((a) => ({ thumb: a.url, alt: a.alt })),
          ),
        )
      }
      for (const it of injected) compose.inject(it)
      segments = [{ text: '', attached: [] }] // URLs now referenced by injected posts
      compose.close()
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to post'
    } finally {
      posting = false
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') cancel()
    else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
  }
</script>

{#if compose.open}
  <div class="backdrop" role="button" tabindex="-1" onclick={() => cancel()} onkeydown={onKeydown}>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      bind:this={dialog}
      onclick={(e) => e.stopPropagation()}
    >
      <div class="head">
        <strong>
          {compose.reply ? 'Reply' : compose.quote ? 'Quote post' : isThread ? 'Thread' : 'New post'}
        </strong>
        <button class="close" aria-label="Close" onclick={() => cancel()}>✕</button>
      </div>

      {#if compose.reply}
        <div class="context">
          <span class="to-label">Replying to {authorName(compose.reply.item)}</span>
          <p class="quote">{postText(compose.reply.item)}</p>
        </div>
      {/if}

      {#each segments as seg, i (i)}
        <div class="segment" class:threaded={isThread}>
          {#if isThread}
            <div class="seg-head">
              <span class="seg-num">{i + 1}</span>
              {#if segments.length > 1}
                <button class="seg-remove" aria-label="Remove post" onclick={() => removeSegment(i)}
                  >✕</button
                >
              {/if}
            </div>
          {/if}

          <textarea
            bind:value={seg.text}
            onkeydown={onKeydown}
            placeholder={i > 0
              ? 'Continue the thread…'
              : compose.reply
                ? 'Write your reply…'
                : compose.quote
                  ? 'Add a comment…'
                  : "What's happening?"}
            rows={isThread ? 3 : 5}
          ></textarea>

          {#if seg.attached.length}
            <div class="attachments">
              {#each seg.attached as img, j (img.url)}
                <div class="att">
                  <img src={img.url} alt="" />
                  <button
                    class="att-remove"
                    aria-label="Remove image"
                    onclick={() => removeImage(i, j)}>✕</button
                  >
                  <input
                    class="att-alt"
                    placeholder="Alt text — describe the image"
                    bind:value={seg.attached[j].alt}
                  />
                </div>
              {/each}
            </div>
          {/if}

          <div class="seg-tools">
            <button
              class="tool"
              title="Add image"
              disabled={seg.attached.length >= MAX_IMAGES}
              onclick={() => fileInputs[i]?.click()}
            >
              🖼 Image
            </button>
            <input
              bind:this={fileInputs[i]}
              type="file"
              accept="image/*"
              multiple
              hidden
              onchange={(e) => onFiles(i, e)}
            />
            <span class="count" class:over={graphemeLength(seg.text) > MAX_GRAPHEMES}>
              {MAX_GRAPHEMES - graphemeLength(seg.text)}
            </span>
          </div>
        </div>
      {/each}

      {#if compose.quote}
        <div class="context quoted">
          <span class="to-label"
            >{authorName(compose.quote)} · @{compose.quote.post.author.handle}</span
          >
          <p class="quote">{postText(compose.quote)}</p>
        </div>
      {/if}

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <div class="foot">
        <button class="add" onclick={addSegment}>+ Add post</button>
        <span class="spacer"></span>
        <button class="post" onclick={submit} disabled={!canPost}>
          {posting
            ? 'Posting…'
            : isThread
              ? `Post thread (${segments.length})`
              : compose.reply
                ? 'Reply'
                : 'Post'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: grid;
    place-items: start center;
    padding-top: 10vh;
    z-index: 1000;
    overflow-y: auto;
  }
  .modal {
    width: 100%;
    max-width: 480px;
    margin-bottom: 4vh;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 1rem 1.1rem 0.9rem;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.7rem;
  }
  .close {
    padding: 0.2rem 0.5rem;
    background: transparent;
    border: none;
    color: var(--text-dim);
  }
  .context {
    border-left: 2px solid var(--border);
    padding: 0.1rem 0 0.1rem 0.7rem;
    margin-bottom: 0.7rem;
  }
  .context.quoted {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.5rem 0.7rem;
    margin: 0.7rem 0 0;
  }
  .to-label {
    font-size: 0.75rem;
    color: var(--text-dim);
  }
  .quote {
    margin: 0.2rem 0 0;
    font-size: 0.85rem;
    color: var(--text-dim);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .segment.threaded {
    border-left: 2px solid var(--border);
    padding-left: 0.7rem;
    margin-bottom: 0.6rem;
  }
  .seg-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.3rem;
  }
  .seg-num {
    font-size: 0.72rem;
    color: var(--text-dim);
  }
  .seg-remove {
    padding: 0.1rem 0.4rem;
    background: transparent;
    border: none;
    color: var(--text-dim);
    font-size: 0.75rem;
  }
  textarea {
    width: 100%;
    resize: vertical;
    font: inherit;
    line-height: 1.4;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.7rem;
  }
  textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  .attachments {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .att {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .att img {
    width: 100%;
    height: 110px;
    object-fit: cover;
    border-radius: 8px;
    border: 1px solid var(--border);
  }
  .att-remove {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    border: none;
    color: #fff;
    font-size: 0.7rem;
    display: grid;
    place-items: center;
  }
  .att-alt {
    width: 100%;
    font-size: 0.75rem;
    padding: 0.35rem 0.5rem;
  }
  .seg-tools {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.4rem;
  }
  .tool {
    font-size: 0.8rem;
    padding: 0.35rem 0.6rem;
  }
  .tool:disabled {
    opacity: 0.5;
  }
  .count {
    color: var(--text-dim);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }
  .count.over {
    color: var(--danger);
  }
  .error {
    color: var(--danger);
    font-size: 0.82rem;
    margin: 0.5rem 0 0;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    margin-top: 0.8rem;
  }
  .spacer {
    flex: 1;
  }
  .add {
    font-size: 0.82rem;
    padding: 0.4rem 0.7rem;
  }
  .post {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
  }
  .post:hover:not(:disabled) {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
</style>
