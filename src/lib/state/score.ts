import { AppBskyFeedPost } from '@atproto/api'
import type { FeedItem } from '../api/timeline'

/**
 * Raw engagement score for a post: the geometric mean of its reposts, likes,
 * and replies (each +1 so a zero doesn't zero out the product). Adapted from
 * Mastotron, which borrowed it from mastodon_digest. The geometric mean keeps
 * any single signal from dominating the way a sum would.
 */
export function postScore(item: FeedItem): number {
  const p = item.post
  const reposts = (p.repostCount ?? 0) + 1
  const likes = (p.likeCount ?? 0) + 1
  const replies = (p.replyCount ?? 0) + 1
  return Math.cbrt(reposts * likes * replies)
}

/** Damping offset (hours) for the rate: a brand-new post is scored as if it
 * were this old, so a minute-old post with 2 likes doesn't outrank everything. */
export const RATE_DAMPING_H = 2

/**
 * Engagement *velocity*: raw score per hour of age (damped). Raw engagement is
 * confounded with age — old posts accumulate — so ranking "loudness" by it
 * partly re-encodes the recency axis. Velocity makes loud mean *hot now*.
 */
export function postScoreRate(item: FeedItem): number {
  const rec = item.post.record
  const created = AppBskyFeedPost.isRecord(rec) ? rec.createdAt : undefined
  const ageH = Math.max(0, (Date.now() - Date.parse(created ?? item.post.indexedAt)) / 3_600_000)
  return postScore(item) / (ageH + RATE_DAMPING_H)
}
