import { DEFAULT_MODEL, summarizeFeed, type Digest } from '../api/llm'
import type { FeedItem } from '../api/timeline'

const MODEL_KEY = 'skynets.llm.model'

function loadModel(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_MODEL
  return localStorage.getItem(MODEL_KEY) ?? DEFAULT_MODEL
}

/**
 * LLM digest state (PLAN §6 Phase E, minimal slice). The API key is held in
 * memory only — never persisted — for the first slice: re-enter per session,
 * which is the safe default given the app's rich-content XSS surface. The model
 * choice (non-sensitive) is persisted. The digest is kept as `previous` and fed
 * back on the next call so conversation labels stay stable.
 */
class DigestState {
  apiKey = $state('')
  model = $state(loadModel())
  digest = $state<Digest | undefined>(undefined)
  loading = $state(false)
  error = $state<string | undefined>(undefined)
  /** When the last digest was produced, for the panel's "as of" note. */
  ranAt = $state<number | undefined>(undefined)

  constructor() {
    if (typeof localStorage !== 'undefined') {
      $effect.root(() => {
        $effect(() => localStorage.setItem(MODEL_KEY, this.model))
      })
    }
  }

  async summarize(items: FeedItem[]) {
    if (this.loading || items.length === 0) return
    this.loading = true
    this.error = undefined
    try {
      this.digest = await summarizeFeed(items, {
        apiKey: this.apiKey,
        model: this.model,
        previous: this.digest,
      })
      this.ranAt = Date.now()
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Summary failed'
    } finally {
      this.loading = false
    }
  }

  clear() {
    this.digest = undefined
    this.error = undefined
    this.ranAt = undefined
  }
}

export const digest = new DigestState()
