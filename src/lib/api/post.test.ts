import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkPost } from '../testing'
import { authorName, bskyUrl, postText, reposter, timeAgo } from './post'

describe('post helpers', () => {
  it('postText reads the record text', () => {
    expect(postText(mkPost({ text: 'hi there' }))).toBe('hi there')
  })

  it('reposter returns the reposter for a repost, undefined otherwise', () => {
    expect(reposter(mkPost({ repostBy: 'bob.test' }))).toBe('bob.test')
    expect(reposter(mkPost())).toBeUndefined()
  })

  it('authorName prefers display name, falls back to handle', () => {
    expect(authorName(mkPost({ author: 'al.test', displayName: 'Al' }))).toBe('Al')
    expect(authorName(mkPost({ author: 'al.test' }))).toBe('al.test')
  })

  it('bskyUrl builds a profile/post web link', () => {
    const item = mkPost({ uri: 'at://did:plc:x/app.bsky.feed.post/abc', author: 'al.test' })
    expect(bskyUrl(item)).toBe('https://bsky.app/profile/al.test/post/abc')
  })
})

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-12T12:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
  const S = 1000
  const M = 60 * S
  const H = 60 * M
  const D = 24 * H

  it('formats each bucket', () => {
    expect(timeAgo(mkPost({ createdAt: ago(10 * S) }))).toBe('just now')
    expect(timeAgo(mkPost({ createdAt: ago(5 * M) }))).toBe('5m')
    expect(timeAgo(mkPost({ createdAt: ago(3 * H) }))).toBe('3h')
    expect(timeAgo(mkPost({ createdAt: ago(2 * D) }))).toBe('2d')
    expect(timeAgo(mkPost({ createdAt: ago(60 * D) }))).toBe('2mo')
    expect(timeAgo(mkPost({ createdAt: ago(400 * D) }))).toBe('1y')
  })
})
