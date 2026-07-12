import type { FeedItem } from './api/timeline'

let counter = 0

export interface PostOpts {
  uri?: string
  author?: string
  displayName?: string
  text?: string
  likes?: number
  reposts?: number
  replies?: number
  createdAt?: string
  parent?: string
  root?: string
  repostBy?: string
}

/** Build a minimal FeedItem for tests, shaped like app.bsky.feed.defs#feedViewPost. */
export function mkPost(opts: PostOpts = {}): FeedItem {
  const handle = opts.author ?? 'alice.test'
  const uri = opts.uri ?? `at://did:plc:${handle}/app.bsky.feed.post/${++counter}`
  const createdAt = opts.createdAt ?? '2026-07-12T12:00:00.000Z'
  const record: Record<string, unknown> = {
    $type: 'app.bsky.feed.post',
    text: opts.text ?? 'hello',
    createdAt,
  }
  if (opts.parent && opts.root) {
    record.reply = {
      parent: { uri: opts.parent, cid: `cid-${opts.parent}` },
      root: { uri: opts.root, cid: `cid-${opts.root}` },
    }
  }
  const item: Record<string, unknown> = {
    post: {
      uri,
      cid: `cid-${uri}`,
      author: { did: `did:plc:${handle}`, handle, displayName: opts.displayName },
      record,
      replyCount: opts.replies ?? 0,
      repostCount: opts.reposts ?? 0,
      likeCount: opts.likes ?? 0,
      indexedAt: createdAt,
    },
  }
  if (opts.repostBy) {
    item.reason = {
      $type: 'app.bsky.feed.defs#reasonRepost',
      by: { did: `did:plc:${opts.repostBy}`, handle: opts.repostBy },
      indexedAt: createdAt,
    }
  }
  return item as unknown as FeedItem
}
