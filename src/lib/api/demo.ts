import type { FeedItem } from './timeline'

/** Demo/fixture mode: `?demo=1` renders the graph with local fake posts, no login. */
export function isDemo(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo')
}

const AUTHORS = [
  ['alice.bsky.social', 'Alice Nguyen'],
  ['bveselka.bsky.social', 'Bo Veselka'],
  ['cmount.bsky.social', 'Cass Mount'],
  ['dpark.bsky.social', 'Dana Park'],
  ['erao.bsky.social', 'El Rao'],
  ['fsato.bsky.social', 'Fen Sato'],
]

const BASE = Date.parse('2026-07-12T15:00:00Z')

interface Spec {
  id: string
  ai: number
  text: string
  likes: number
  reposts: number
  replies: number
  minsAgo: number
  reply?: { parent: string; root: string }
  repostBy?: number
}

function make(s: Spec): FeedItem {
  const [handle, displayName] = AUTHORS[s.ai]
  const uri = `at://did:plc:${handle}/app.bsky.feed.post/${s.id}`
  const created = new Date(BASE - s.minsAgo * 60_000).toISOString()
  const record: Record<string, unknown> = {
    $type: 'app.bsky.feed.post',
    text: s.text,
    createdAt: created,
  }
  if (s.reply) {
    record.reply = {
      parent: { uri: s.reply.parent, cid: `cid-${s.reply.parent}` },
      root: { uri: s.reply.root, cid: `cid-${s.reply.root}` },
    }
  }
  const item: Record<string, unknown> = {
    post: {
      uri,
      cid: `cid-${s.id}`,
      author: { did: `did:plc:${handle}`, handle, displayName },
      record,
      replyCount: s.replies,
      repostCount: s.reposts,
      likeCount: s.likes,
      indexedAt: created,
    },
  }
  if (s.repostBy !== undefined) {
    const [rh, rn] = AUTHORS[s.repostBy]
    item.reason = {
      $type: 'app.bsky.feed.defs#reasonRepost',
      by: { did: `did:plc:${rh}`, handle: rh, displayName: rn },
      indexedAt: created,
    }
  }
  return item as unknown as FeedItem
}

/** ~25 posts: standalone with varied engagement + one 5-post thread. */
export function demoFeed(): FeedItem[] {
  const specs: Spec[] = []
  const texts = [
    'the semantic layout finally clicks when you stop scrolling',
    'a map of conversations, not a feed of noise',
    'reposting this because it deserves more eyes',
    'quiet post, low engagement, bottom of the graph',
    'hot take that got a lot of replies today',
    'just a normal afternoon thought',
    'the force sim settling into place is oddly satisfying',
    'dismissing a whole thread at once is the dream',
    'engagement on the y-axis makes triage fast',
    'newest on the right, loudest on top',
    'thread collapsing keeps the graph readable',
    'another mid post to fill the queue',
    'testing the config popover overflow',
    'top / recent / mix — pick your poison',
    'auto-cycle is off by default and that is correct',
    'the loudest half plus the newest half',
    'nodes should fill the whole canvas now',
    'a late-night musing about interfaces',
    'small account, big idea, low numbers',
    'the digest view is the everyday mode',
  ]
  for (let i = 0; i < texts.length; i++) {
    specs.push({
      id: `p${i}`,
      ai: i % AUTHORS.length,
      text: texts[i],
      likes: (i * 7) % 40,
      reposts: (i * 3) % 12,
      replies: (i * 5) % 9,
      minsAgo: i * 11 + 3,
      repostBy: i === 2 ? 4 : undefined,
    })
  }
  // A 5-post thread rooted at t0 (tests collapsing + "+N" badge).
  const root = 'at://did:plc:alice.bsky.social/app.bsky.feed.post/t0'
  specs.push({ id: 't0', ai: 0, text: 'starting a thread about the graph metaphor', likes: 30, reposts: 8, replies: 4, minsAgo: 25 })
  for (let k = 1; k <= 4; k++) {
    const parent =
      k === 1 ? root : `at://did:plc:alice.bsky.social/app.bsky.feed.post/t${k - 1}`
    specs.push({
      id: `t${k}`,
      ai: 0,
      text: `reply ${k} in the thread, each one a little quieter`,
      likes: 12 - k * 2,
      reposts: 2,
      replies: 1,
      minsAgo: 24 - k,
      reply: { parent, root },
    })
  }
  return specs.map(make)
}
