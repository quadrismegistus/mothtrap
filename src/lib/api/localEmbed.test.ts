import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The worker client had no tests at all: the only module importing it mocks it
 * away, so its failure paths — the ones that decide whether a download problem
 * degrades gracefully or hangs the digest — were never exercised.
 *
 * A fake Worker stands in for the real one. Node has no `Worker`, which is also
 * the "unavailable" case worth pinning.
 */

class FakeWorker {
  static last: FakeWorker | undefined
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: ((e: { message: string }) => void) | null = null
  posted: unknown[] = []
  terminated = false
  constructor() {
    FakeWorker.last = this
  }
  postMessage(m: unknown) {
    this.posted.push(m)
  }
  terminate() {
    this.terminated = true
  }
  /** Answer a request the way the real worker would. */
  reply(vectors: number[][]) {
    const id = (this.posted.at(-1) as { id: number }).id
    this.onmessage?.({ data: { id, vectors } })
  }
  fail(error: string) {
    const id = (this.posted.at(-1) as { id: number }).id
    this.onmessage?.({ data: { id, error } })
  }
  boom(message: string) {
    this.onerror?.({ message })
  }
}

async function freshModule() {
  vi.resetModules()
  return import('./localEmbed')
}

beforeEach(() => {
  FakeWorker.last = undefined
  vi.stubGlobal('Worker', FakeWorker)
})
afterEach(() => vi.unstubAllGlobals())

describe('localEmbed', () => {
  it('returns vectors for a normal round trip', async () => {
    const { localEmbed } = await freshModule()
    const p = localEmbed(['a', 'b'])
    FakeWorker.last!.reply([
      [1, 0],
      [0, 1],
    ])
    await expect(p).resolves.toEqual([
      [1, 0],
      [0, 1],
    ])
  })

  it('short-circuits an empty batch without spawning a worker', async () => {
    const { localEmbed } = await freshModule()
    await expect(localEmbed([])).resolves.toEqual([])
    expect(FakeWorker.last).toBeUndefined()
  })

  it('rejects when the worker reports an error, so the caller can fall back', async () => {
    const { localEmbed } = await freshModule()
    const p = localEmbed(['a'])
    FakeWorker.last!.fail('model missing')
    await expect(p).rejects.toThrow('model missing')
  })

  it('a worker that fails to boot fails every waiter and stops being retried', async () => {
    // The point of latching `unavailable`: without it every later batch would
    // pay a fresh boot attempt and a 120s timeout before degrading.
    const { localEmbed, localEmbedAvailable } = await freshModule()
    const a = localEmbed(['a'])
    const b = localEmbed(['b'])
    FakeWorker.last!.boom('no wasm backend')
    await expect(a).rejects.toThrow(/no wasm backend/)
    await expect(b).rejects.toThrow(/no wasm backend/)
    expect(localEmbedAvailable()).toBe(false)
    await expect(localEmbed(['c'])).rejects.toThrow(/unavailable/)
  })

  it('times out rather than hanging the digest forever', async () => {
    vi.useFakeTimers()
    const { localEmbed } = await freshModule()
    const p = localEmbed(['a'], 50)
    const assertion = expect(p).rejects.toThrow(/timed out/)
    await vi.advanceTimersByTimeAsync(60)
    await assertion
    vi.useRealTimers()
  })

  it('reports unavailable where there is no Worker at all', async () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('Worker', undefined)
    const { localEmbed, localEmbedAvailable } = await freshModule()
    expect(localEmbedAvailable()).toBe(false)
    await expect(localEmbed(['a'])).rejects.toThrow(/unavailable/)
  })

  it('disposing terminates the worker, so logout drops the loaded weights', async () => {
    const { localEmbed, disposeLocalEmbed } = await freshModule()
    const p = localEmbed(['a'])
    FakeWorker.last!.reply([[1]])
    await p
    disposeLocalEmbed()
    expect(FakeWorker.last!.terminated).toBe(true)
  })
})
