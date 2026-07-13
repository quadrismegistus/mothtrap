import { SvelteMap, SvelteSet } from 'svelte/reactivity'
import { getProfiles } from '../api/actors'
import { followUser, unfollowUser } from '../api/interactions'

interface FollowState {
  following: boolean
  followUri?: string
}

interface Author {
  did: string
  viewer?: { following?: string }
}

/**
 * Optimistic follow state, overlaid by DID. Falls back to the author's own
 * `viewer.following` (a follow-record uri if you already follow them) until you
 * interact. Since the timeline is your *following* feed you'll already follow
 * most authors; this matters for reposts and pulled-in reply parents.
 */
class Follows {
  #map = new SvelteMap<string, FollowState>()
  // Dids whose follow state has been (or is being) verified via getProfiles —
  // plain Set on purpose: reading it must not retrigger the verify effect.
  #checked = new Set<string>()
  // Dids the user explicitly unfollowed this session (reactive: the graph
  // prunes their posts live). Deliberately NOT fed by verify() — discovering
  // someone was never followed must not silently hide what the feed served.
  #unfollowed = new SvelteSet<string>()

  following(author: Author): boolean {
    return this.#map.get(author.did)?.following ?? !!author.viewer?.following
  }

  /** True only for an explicit unfollow action this session — safe to prune on. */
  knownUnfollowed(did: string): boolean {
    return this.#unfollowed.has(did)
  }

  /**
   * Verify follow state against the authoritative profile record (batched,
   * once per did per session). Feed/thread responses *should* carry
   * `viewer.following`, but a missing one silently marks a followed account as
   * unfollowed (dashed) — this self-corrects that within a beat.
   */
  async verify(authors: Author[]) {
    const dids = [...new Set(authors.map((a) => a.did))].filter((d) => !this.#checked.has(d))
    if (!dids.length) return
    for (const d of dids) this.#checked.add(d)
    for (let i = 0; i < dids.length; i += 25) {
      const chunk = dids.slice(i, i + 25)
      try {
        for (const p of await getProfiles(chunk)) {
          // Don't clobber an optimistic toggle already in the overlay.
          if (this.#map.has(p.did)) continue
          const f = p.viewer?.following
          this.#map.set(p.did, { following: !!f, followUri: f })
        }
      } catch {
        for (const d of chunk) this.#checked.delete(d) // retry on a later pass
      }
    }
  }

  async toggle(author: Author) {
    const did = author.did
    const cur = this.#map.get(did) ?? {
      following: !!author.viewer?.following,
      followUri: author.viewer?.following,
    }
    if (cur.following) {
      const del = cur.followUri
      this.#map.set(did, { following: false, followUri: undefined })
      this.#unfollowed.add(did)
      if (del)
        await unfollowUser(del).catch(() => {
          this.#map.set(did, cur)
          this.#unfollowed.delete(did)
        })
    } else {
      this.#map.set(did, { following: true, followUri: cur.followUri })
      this.#unfollowed.delete(did)
      try {
        const res = await followUser(did)
        this.#map.set(did, { following: true, followUri: res.uri })
      } catch {
        this.#map.set(did, cur)
      }
    }
  }
}

export const follows = new Follows()
