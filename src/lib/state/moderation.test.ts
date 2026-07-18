import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BSKY_LABELER_DID, DEFAULT_LABEL_SETTINGS, type ModerationPrefs } from '@atproto/api'
import { moderation } from './moderation.svelte'
import type { FeedItem } from '../api/timeline'
import * as api from '../api/moderation'

// The wrappers themselves are one-liners over the agent; what needs testing is
// the optimistic overlay around them, so stub the network edge.
vi.mock('../api/moderation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/moderation')>()),
  muteActor: vi.fn(async () => {}),
  unmuteActor: vi.fn(async () => {}),
  blockActor: vi.fn(async () => ({ uri: 'at://me/app.bsky.graph.block/abc' })),
  unblockActor: vi.fn(async () => {}),
  reportPost: vi.fn(async () => {}),
  reportAccount: vi.fn(async () => {}),
}))

const AT = new Date(0).toISOString()

let n = 0
function makeItem(
  opts: { labels?: string[]; viewer?: Record<string, unknown>; text?: string } = {},
): FeedItem {
  const uri = `at://did:plc:them/app.bsky.feed.post/${++n}`
  return {
    post: {
      uri,
      cid: `cid${n}`,
      author: { did: 'did:plc:them', handle: 'them.bsky.social', viewer: opts.viewer ?? {} },
      record: { $type: 'app.bsky.feed.post', text: opts.text ?? 'hello', createdAt: AT },
      labels: (opts.labels ?? []).map((val) => ({ src: BSKY_LABELER_DID, uri, val, cts: AT })),
      indexedAt: AT,
    },
  } as unknown as FeedItem
}

function prefs(over: Partial<ModerationPrefs> = {}): ModerationPrefs {
  return {
    adultContentEnabled: false,
    labels: { ...DEFAULT_LABEL_SETTINGS },
    labelers: [{ did: BSKY_LABELER_DID, labels: {} }],
    mutedWords: [],
    hiddenPosts: [],
    ...over,
  }
}

beforeEach(() => {
  moderation.reset()
  moderation.setUser('did:plc:me')
})

describe('moderation', () => {
  it('leaves an unlabeled post alone', () => {
    const item = makeItem()
    expect(moderation.hidden(item)).toBe(false)
    expect(moderation.cover(item).blur).toBe(false)
  })

  it('moderates on Bluesky defaults before any prefs load', () => {
    // The account's real prefs arrive later (feeds.load) or never (offline,
    // failed request). Neither may leave moderation switched off.
    expect(moderation.hidden(makeItem({ labels: ['porn'] }))).toBe(true)
    expect(moderation.hidden(makeItem({ labels: ['!hide'] }))).toBe(true)
  })

  // The load-bearing case for the graph, and it has to be a LABEL to test it.
  // A mute short-circuits cover() before the decision is consulted, so a muted
  // author proves nothing about contentList vs contentView. A porn label does:
  // contentList reports filter=1/blur=0 (→ a full cover), while contentView
  // reports filter=0/blur=0 and would fall through to a MEDIA-only cover,
  // leaving the post's text on screen.
  it('judges covers as a list, not as an opened post page', () => {
    const item = makeItem({ labels: ['porn'] })
    const c = moderation.cover(item)
    expect(c.blur).toBe(true)
    expect(c.media).toBe(false) // contentView would give media-only here
    expect(c.canReveal).toBe(false)
  })

  it('covers a muted author pulled in as context, not just hides them', () => {
    const item = makeItem({ viewer: { muted: true } })
    expect(moderation.hidden(item)).toBe(true)
    const c = moderation.cover(item)
    expect(c.blur).toBe(true)
    expect(c.reason).toBe('Muted account')
  })

  it('offers no way past a block', () => {
    const c = moderation.cover(makeItem({ viewer: { blocking: 'at://x' } }))
    expect(c.blur).toBe(true)
    expect(c.canReveal).toBe(false)
  })

  it('covers a warn-labeled post without hiding it', () => {
    const item = makeItem({ labels: ['!warn'] })
    expect(moderation.hidden(item)).toBe(false)
    const c = moderation.cover(item)
    expect(c.blur).toBe(true)
    expect(c.media).toBe(false)
    expect(c.canReveal).toBe(true)
    // Built-in labels carry no locale strings; without a fallback table the
    // user would be shown the raw value `!warn`.
    expect(c.reason).toBe('Content warning')
  })

  it('covers only the media when only the media is labeled', () => {
    moderation.adopt(prefs({ adultContentEnabled: true }))
    const item = makeItem({ labels: ['graphic-media'] })
    expect(moderation.hidden(item)).toBe(false)
    const c = moderation.cover(item)
    expect(c.blur).toBe(true)
    expect(c.media).toBe(true) // the words survive; the image doesn't
  })

  it('refuses the reveal when an inner layer is no-override', () => {
    // porn is overridable at list level but not at media level — offering
    // "show anyway" on the outer cover would walk straight past the inner one.
    const item = makeItem({ labels: ['porn'] })
    expect(moderation.cover(item).canReveal).toBe(false)
    moderation.reveal(item)
    expect(moderation.cover(item).blur).toBe(true)
  })

  it('reveals a coverable post for the session', () => {
    const item = makeItem({ labels: ['!warn'] })
    moderation.reveal(item)
    expect(moderation.cover(item).blur).toBe(false)
    // …and a fresh session starts covered again.
    moderation.reset()
    moderation.setUser('did:plc:me')
    expect(moderation.cover(item).blur).toBe(true)
  })

  it('re-decides an already-seen post when prefs change', () => {
    const item = makeItem({ text: 'this has badword in it' })
    expect(moderation.hidden(item)).toBe(false)
    moderation.adopt(
      prefs({ mutedWords: [{ value: 'badword', targets: ['content'], actorTarget: 'all' }] }),
    )
    expect(moderation.hidden(item)).toBe(true) // stale memo would say false
  })

  it('keeps defaults when prefs are unavailable', () => {
    moderation.adopt(undefined)
    expect(moderation.hidden(makeItem({ labels: ['porn'] }))).toBe(true)
  })

  it('drops everything on logout', () => {
    const item = makeItem({ labels: ['!warn'] })
    moderation.reveal(item)
    moderation.reset()
    expect(moderation.cover(item).blur).toBe(true)
  })
})

describe('moderation actions', () => {
  beforeEach(() => vi.clearAllMocks())

  // The whole point of the overlay: a decision is computed from the post's
  // `viewer` state, frozen at fetch time. Without a local override, blocking
  // someone would appear to do nothing until the next refetch.
  it('a block suppresses that author immediately, before any refetch', async () => {
    const item = makeItem()
    expect(moderation.hidden(item)).toBe(false)
    await moderation.block(item.post.author)
    expect(moderation.hidden(item)).toBe(true)
    expect(api.blockActor).toHaveBeenCalledWith('did:plc:them')
  })

  it('a muted author is covered but still reachable; a blocked one is not', async () => {
    const muted = makeItem()
    await moderation.mute(muted.post.author)
    const mc = moderation.cover(muted)
    expect(mc.reason).toBe('Muted account')
    expect(mc.canReveal).toBe(true)

    moderation.reset()
    moderation.setUser('did:plc:me')
    const blocked = makeItem()
    await moderation.block(blocked.post.author)
    const bc = moderation.cover(blocked)
    expect(bc.reason).toBe('Blocked account')
    expect(bc.canReveal).toBe(false)
  })

  it('rolls the overlay back when the write fails', async () => {
    const item = makeItem()
    vi.mocked(api.blockActor).mockRejectedValueOnce(new Error('offline'))
    await expect(moderation.block(item.post.author)).rejects.toThrow('offline')
    // Rethrown so the UI can report it, and NOT left looking blocked.
    expect(moderation.isBlocked(item.post.author)).toBe(false)
    expect(moderation.hidden(item)).toBe(false)
  })

  it('rolls a failed mute back too', async () => {
    const item = makeItem()
    vi.mocked(api.muteActor).mockRejectedValueOnce(new Error('nope'))
    await expect(moderation.mute(item.post.author)).rejects.toThrow('nope')
    expect(moderation.isMuted(item.post.author)).toBe(false)
  })

  it('reads block state the feed already carried, and unblocks with its uri', async () => {
    const server = makeItem({ viewer: { blocking: 'at://me/app.bsky.graph.block/xyz' } })
    expect(moderation.isBlocked(server.post.author)).toBe(true)
    expect(moderation.hidden(server)).toBe(true)
    await moderation.unblock(server.post.author)
    expect(api.unblockActor).toHaveBeenCalledWith('at://me/app.bsky.graph.block/xyz')
  })

  it('learns the record uri so a block made this session can be undone', async () => {
    const item = makeItem()
    await moderation.block(item.post.author)
    expect(moderation.blockUri(item.post.author)).toBe('at://me/app.bsky.graph.block/abc')
    await moderation.unblock(item.post.author)
    expect(api.unblockActor).toHaveBeenCalledWith('at://me/app.bsky.graph.block/abc')
    expect(moderation.isBlocked(item.post.author)).toBe(false)
  })

  it('reports a post against its exact cid', async () => {
    const item = makeItem()
    await moderation.reportPost(item, 'com.atproto.moderation.defs#reasonSpam', ' bot ')
    expect(api.reportPost).toHaveBeenCalledWith(
      item.post.uri,
      item.post.cid,
      'com.atproto.moderation.defs#reasonSpam',
      ' bot ',
    )
  })

  it('reporting alone does not hide anything — that stays the user’s choice', async () => {
    const item = makeItem()
    await moderation.reportPost(item, 'com.atproto.moderation.defs#reasonRude')
    expect(moderation.hidden(item)).toBe(false)
    expect(moderation.cover(item).blur).toBe(false)
  })

  it('forgets mutes and blocks on logout', async () => {
    const item = makeItem()
    await moderation.block(item.post.author)
    moderation.reset()
    expect(moderation.isBlocked(item.post.author)).toBe(false)
  })
})

describe('replies to silenced accounts', () => {
  const reply = (parentDid: string): FeedItem =>
    ({
      post: {
        uri: 'at://did:plc:me/app.bsky.feed.post/r1',
        cid: 'cr1',
        author: { did: 'did:plc:friend', handle: 'friend.test', viewer: {} },
        record: {
          $type: 'app.bsky.feed.post',
          text: 'strong disagree',
          createdAt: AT,
          reply: {
            root: { uri: `at://${parentDid}/app.bsky.feed.post/p1`, cid: 'cp1' },
            parent: { uri: `at://${parentDid}/app.bsky.feed.post/p1`, cid: 'cp1' },
          },
        },
        indexedAt: AT,
      },
    }) as unknown as FeedItem

  it('reads the parent author out of the at-uri, with no lookup', async () => {
    const r = reply('did:plc:loud')
    expect(moderation.repliesToSilenced(r)).toBe(false)
    // The feed filter runs before any parent is fetched, so this must work from
    // the uri alone.
    await moderation.mute({ did: 'did:plc:loud' })
    expect(moderation.repliesToSilenced(r)).toBe(true)
  })

  it('covers blocks too — the stronger signal cannot be the weaker filter', async () => {
    const r = reply('did:plc:blocked')
    await moderation.block({ did: 'did:plc:blocked' })
    expect(moderation.repliesToSilenced(r)).toBe(true)
  })

  it('ignores non-replies and unparseable parents', () => {
    expect(moderation.repliesToSilenced(makeItem())).toBe(false) // not a reply
    const weird = reply('not-a-did')
    expect(moderation.repliesToSilenced(weird)).toBe(false)
  })
})

describe('un-silencing takes effect immediately', () => {
  it('un-muting an author the FEED still calls muted works at once', async () => {
    // The overlay only ever added suppression, so this used to need a refetch.
    const item = makeItem({ viewer: { muted: true } })
    expect(moderation.hidden(item)).toBe(true)
    await moderation.unmute(item.post.author)
    expect(moderation.isMuted(item.post.author)).toBe(false)
    expect(moderation.hidden(item)).toBe(false)
  })

  it('un-blocking an author the FEED still calls blocked works at once', async () => {
    // Worse than a delay for blocks: the cover is canReveal:false, so the
    // user's own un-block was unhonoured with no way to see the content.
    const item = makeItem({ viewer: { blocking: 'at://me/app.bsky.graph.block/xyz' } })
    expect(moderation.cover(item).canReveal).toBe(false)
    await moderation.unblock(item.post.author)
    expect(moderation.isBlocked(item.post.author)).toBe(false)
    expect(moderation.cover(item).blur).toBe(false)
  })

  it('rolls the un-silencing back if the write fails', async () => {
    const item = makeItem({ viewer: { muted: true } })
    vi.mocked(api.unmuteActor).mockRejectedValueOnce(new Error('offline'))
    await expect(moderation.unmute(item.post.author)).rejects.toThrow('offline')
    expect(moderation.isMuted(item.post.author)).toBe(true) // still muted
  })
})
