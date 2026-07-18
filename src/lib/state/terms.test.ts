import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as platform from '../api/platform'
import { terms, TERMS_VERSION } from './terms.svelte'

vi.mock('../api/platform', () => ({ isNative: vi.fn(() => false) }))

beforeEach(() => terms.reset())
afterEach(() => vi.mocked(platform.isNative).mockReturnValue(false))

describe('terms gate', () => {
  it('never gates the web app', () => {
    // An agreement wall in front of someone's own research instrument is pure
    // friction: the terms are published either way, and mothtrap.blue has never
    // been the thing under review.
    vi.mocked(platform.isNative).mockReturnValue(false)
    expect(terms.required).toBe(false)
    expect(terms.accepted).toBe(false) // …though it is still unaccepted
  })

  it('gates the native build until agreed', () => {
    vi.mocked(platform.isNative).mockReturnValue(true)
    expect(terms.required).toBe(true)
    terms.accept()
    expect(terms.required).toBe(false)
    expect(terms.accepted).toBe(true)
  })

  it('re-asks when the terms change materially', () => {
    // Agreement to version 1 is not agreement to version 2. Relying on it would
    // mean claiming consent to a document that no longer exists.
    vi.mocked(platform.isNative).mockReturnValue(true)
    terms.accept()
    expect(terms.required).toBe(false)
    terms.acceptedVersion = TERMS_VERSION - 1 // as if the version were bumped
    expect(terms.required).toBe(true)
  })

  it('can be withdrawn, putting the gate back', () => {
    vi.mocked(platform.isNative).mockReturnValue(true)
    terms.accept()
    terms.reset()
    expect(terms.required).toBe(true)
  })

  it('treats an unreadable store as not agreed', () => {
    // Private mode: ask again rather than assume agreement.
    expect(terms.acceptedVersion).toBe(0)
  })
})
