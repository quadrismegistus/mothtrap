<script lang="ts">
  import { terms } from '../state/terms.svelte'

  const base = import.meta.env.BASE_URL ?? '/'
  let declined = $state(false)
</script>

<!-- A gate, not a dialog: no backdrop dismissal, no Escape. The whole point is
     a deliberate answer, so there is nothing to click past. -->
<div class="gate">
  <div class="panel" role="dialog" aria-modal="true" aria-label="Terms of use" tabindex="-1">
    {#if declined}
      <h2>Mothtrap needs your agreement to run</h2>
      <p>
        That's a fair answer. But these terms are the basis on which the app operates, so it can't
        continue without them.
      </p>
      <div class="row">
        <button class="primary" onclick={() => (declined = false)}>Back</button>
      </div>
    {:else}
      <h2>Before you start</h2>

      <p class="zero">
        There is no tolerance here for objectionable content or abusive behaviour — harassment,
        threats, hate speech, or anything illegal or sexually exploitative.
      </p>

      <p>
        Mothtrap displays Bluesky; it doesn't host it. So every post has
        <strong>report</strong>, <strong>mute</strong> and <strong>block</strong> in its ⋯ menu,
        reports go to the moderation service that can actually act, and the labels, mutes and
        blocks on your account are honoured here.
      </p>

      <p>
        Your account's labels, mutes and blocks are applied here — but it's still a general social
        feed, so it isn't for under-17s. It's a research project provided as-is, with no warranty:
        it may break or change.
      </p>

      <p class="fine">
        The full <a href="{base}terms.html" target="_blank" rel="noreferrer">terms</a>,
        <a href="{base}privacy.html" target="_blank" rel="noreferrer">privacy policy</a> and
        <a href="{base}contact.html" target="_blank" rel="noreferrer">contact details</a> open in
        your browser.
      </p>

      <div class="row">
        <button onclick={() => (declined = true)}>Decline</button>
        <button class="primary" onclick={() => terms.accept()}>I agree</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .gate {
    position: fixed;
    inset: 0;
    background: var(--bg);
    display: grid;
    place-items: center;
    z-index: 2000; /* above every other modal: nothing precedes this */
    padding: 1rem;
  }
  .panel {
    width: min(430px, 100%);
    max-height: 90vh;
    overflow-y: auto;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.2rem;
  }
  h2 {
    margin: 0 0 0.7rem;
    font-size: 1.05rem;
  }
  p {
    margin: 0 0 0.7rem;
    font-size: 0.86rem;
    line-height: 1.5;
    color: var(--text-dim);
  }
  .zero {
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-left: 3px solid var(--danger);
    border-radius: 8px;
    padding: 0.6rem 0.7rem;
  }
  .fine {
    font-size: 0.78rem;
  }
  .fine a {
    color: var(--accent);
  }
  .row {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .row button {
    padding: 0.45rem 0.9rem;
    font: inherit;
    font-size: 0.85rem;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
  }
  .row button.primary {
    color: #fff;
    background: var(--accent);
    border-color: var(--accent);
  }
</style>
