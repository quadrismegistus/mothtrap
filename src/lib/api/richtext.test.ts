import { describe, expect, it } from 'vitest'
import { segments } from './richtext'

describe('segments', () => {
  it('splits text into link and plain runs using facets', () => {
    const text = 'see https://ex.com now'
    const facets = [
      {
        index: { byteStart: 4, byteEnd: 18 },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://ex.com' }],
      },
    ]
    const segs = segments(text, facets)
    expect(segs.map((s) => s.text).join('')).toBe(text) // lossless
    const link = segs.find((s) => s.href)
    expect(link?.text).toBe('https://ex.com')
    expect(link?.href).toBe('https://ex.com')
  })

  it('maps a mention facet to a bsky profile link', () => {
    const text = 'hi @alice.test'
    const facets = [
      {
        index: { byteStart: 3, byteEnd: 14 },
        features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:alice' }],
      },
    ]
    const link = segments(text, facets).find((s) => s.href)
    expect(link?.href).toBe('https://bsky.app/profile/did:plc:alice')
  })

  it('returns a single plain segment when there are no facets', () => {
    expect(segments('hello world', undefined)).toEqual([{ text: 'hello world' }])
  })
})
