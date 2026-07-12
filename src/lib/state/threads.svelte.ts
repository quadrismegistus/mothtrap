import { SvelteSet } from 'svelte/reactivity'
import { fetchThread } from '../api/thread'
import type { FeedItem } from '../api/timeline'

/**
 * Full conversations fetched on demand (when a thread is expanded). Fetched
 * posts are merged into the graph's item pool so the whole thread shows, not
 * just the replies that happened to be in the timeline.
 */
class Threads {
  posts = $state<FeedItem[]>([])
  loading = new SvelteSet<string>()
  fetched = new SvelteSet<string>()

  /** Fetch a thread once; merge new posts (deduped by uri). */
  async ensure(rootUri: string) {
    if (this.fetched.has(rootUri) || this.loading.has(rootUri)) return
    this.loading.add(rootUri)
    try {
      const items = await fetchThread(rootUri)
      const have = new Set(this.posts.map((p) => p.post.uri))
      const fresh = items.filter((i) => !have.has(i.post.uri))
      if (fresh.length) this.posts = [...this.posts, ...fresh]
      this.fetched.add(rootUri)
    } catch {
      // Leave unfetched so a later expand can retry.
    } finally {
      this.loading.delete(rootUri)
    }
  }

  isLoading(rootUri: string): boolean {
    return this.loading.has(rootUri)
  }
}

export const threads = new Threads()
