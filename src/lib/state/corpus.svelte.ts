import { SvelteMap } from 'svelte/reactivity'
import type { FeedItem } from '../api/timeline'
import { reposterProfile } from '../api/post'
import { archive, KIND_RANK, type AppearanceKind } from './archive'

/**
 * The reactive in-memory mirror of the local corpus (archive-first, PLAN §8
 * phase 2). ONE funnel every fetched post flows through: it updates a reactive
 * index the graph derives its view from AND writes through to the archive, so
 * the two never drift. Rehydrated from the archive on open, so a reload has the
 * corpus in memory before the network answers.
 *
 * The corpus is the raw SUPERSET — every post ever fetched, with its provenance
 * (timeline / repost / context). The graph's filtering (reposts off, follows-
 * only, unfollowed pruning) is a derivation OVER this, not baked in here: the
 * corpus records what was seen; the view decides what to show.
 */
class Corpus {
  #byUri = new SvelteMap<string, FeedItem>()
  #kind = new SvelteMap<string, AppearanceKind>()

  /** All corpus posts (reactive). Insertion order = first-seen order. */
  get items(): FeedItem[] {
    return [...this.#byUri.values()]
  }

  /** Strongest provenance recorded for a uri (primary > context), or undefined
   * if unseen. A post is PRIMARY (in your feed) when this isn't 'context'. */
  kindOf(uri: string): AppearanceKind | undefined {
    return this.#kind.get(uri)
  }
  isPrimary(uri: string): boolean {
    const k = this.#kind.get(uri)
    return k !== undefined && k !== 'context'
  }
  has(uri: string): boolean {
    return this.#byUri.has(uri)
  }
  get size(): number {
    return this.#byUri.size
  }

  /** Record posts into the mirror AND the archive. `forceKind` overrides the
   * per-item timeline/repost inference — pass 'context' for posts pulled in only
   * to complete a thread or ancestor chain. Returns the posts that were newly
   * added to the mirror (not seen before), for callers that want the delta. */
  record(items: FeedItem[], forceKind?: AppearanceKind): FeedItem[] {
    const added: FeedItem[] = []
    for (const item of items) if (this.#mergeOne(item, forceKind)) added.push(item)
    void archive.record(items, forceKind)
    return added
  }

  /** Merge one post; return true if its uri was new to the mirror. */
  #mergeOne(item: FeedItem, forceKind?: AppearanceKind): boolean {
    const uri = item.post.uri
    const kind = forceKind ?? (reposterProfile(item)?.did ? 'repost' : 'timeline')
    const prevKind = this.#kind.get(uri)
    if (!prevKind || KIND_RANK[kind] > KIND_RANK[prevKind]) this.#kind.set(uri, kind)
    const existing = this.#byUri.get(uri)
    // Keep the richest copy: one that still carries a repost `reason` (so the
    // reposter attribution survives a later plain sighting), else the first.
    if (!existing) {
      this.#byUri.set(uri, item)
      return true
    }
    if (reposterProfile(item) && !reposterProfile(existing)) this.#byUri.set(uri, item)
    return false
  }

  /** Load the archived corpus into the mirror (call once the DB is open). Posts
   * come back without their feed-level repost reason (not stored); provenance
   * is reconstructed from the appearances log. Live records this session then
   * overlay the richer copies. */
  async rehydrate(): Promise<void> {
    const [posts, provenance] = await Promise.all([archive.getAllPosts(), archive.getProvenance()])
    for (const item of posts) {
      const uri = item.post.uri
      if (!this.#byUri.has(uri)) this.#byUri.set(uri, item)
      const kind = provenance.get(uri) ?? 'context'
      const prevKind = this.#kind.get(uri)
      if (!prevKind || KIND_RANK[kind] > KIND_RANK[prevKind]) this.#kind.set(uri, kind)
    }
  }

  clear(): void {
    this.#byUri.clear()
    this.#kind.clear()
  }
}

export const corpus = new Corpus()
export { Corpus }
