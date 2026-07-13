import {
  DEFAULT_MODEL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_URL,
  summarizeFeed,
  type Digest,
  type Provider,
} from '../api/llm'
import type { FeedItem } from '../api/timeline'

const KEY = 'skynets.llm'

interface Persisted {
  provider: Provider
  model: string
  ollamaModel: string
  ollamaUrl: string
}

function load(): Partial<Persisted> {
  if (typeof localStorage === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Persisted>
  } catch {
    return {}
  }
}

/**
 * LLM digest state (PLAN §6 Phase E, minimal slice). The Anthropic API key is
 * held in memory only — never persisted — the safe default given the app's
 * rich-content XSS surface; re-enter per session. Everything non-sensitive
 * (provider choice, model names, the Ollama URL) IS persisted. The digest is
 * kept as `previous` and fed back on the next call so labels stay stable.
 */
class DigestState {
  apiKey = $state('')
  provider = $state<Provider>('anthropic')
  model = $state(DEFAULT_MODEL)
  ollamaModel = $state(DEFAULT_OLLAMA_MODEL)
  ollamaUrl = $state(DEFAULT_OLLAMA_URL)
  digest = $state<Digest | undefined>(undefined)
  loading = $state(false)
  error = $state<string | undefined>(undefined)
  /** When the last digest was produced, for the panel's "as of" note. */
  ranAt = $state<number | undefined>(undefined)

  constructor() {
    const p = load()
    if (p.provider === 'anthropic' || p.provider === 'ollama') this.provider = p.provider
    if (typeof p.model === 'string') this.model = p.model
    if (typeof p.ollamaModel === 'string') this.ollamaModel = p.ollamaModel
    if (typeof p.ollamaUrl === 'string') this.ollamaUrl = p.ollamaUrl

    if (typeof localStorage !== 'undefined') {
      $effect.root(() => {
        $effect(() => {
          const data: Persisted = {
            provider: this.provider,
            model: this.model,
            ollamaModel: this.ollamaModel,
            ollamaUrl: this.ollamaUrl,
          }
          localStorage.setItem(KEY, JSON.stringify(data))
        })
      })
    }
  }

  async summarize(items: FeedItem[]) {
    if (this.loading || items.length === 0) return
    this.loading = true
    this.error = undefined
    try {
      this.digest = await summarizeFeed(items, {
        provider: this.provider,
        model: this.provider === 'ollama' ? this.ollamaModel : this.model,
        apiKey: this.apiKey,
        ollamaUrl: this.ollamaUrl,
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
