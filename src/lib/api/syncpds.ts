import { getAgent } from './agent'
import type { SyncEnvelope } from './sync'

/**
 * Phase 1 sync transport (docs/sync-spec.md §4): the encrypted envelope stored
 * as a single record in the user's OWN atproto repo. The record is public (on
 * the firehose) but holds only ciphertext — that's the whole point, and it means
 * we don't need atproto's (immature) private storage.
 *
 * Phase 1 inlines the ciphertext in the record (small: a few KB of judgments).
 * Large sets move to a blob in Phase 2, once pruning bounds the dismissed set.
 */
export const SYNC_COLLECTION = 'blue.mothtrap.sync.state'
const RKEY = 'self'

/** Write (overwrite) the sync record for the current account. */
export async function putSyncState(env: SyncEnvelope, account: string): Promise<void> {
  const agent = getAgent()
  await agent.com.atproto.repo.putRecord({
    repo: agent.assertDid,
    collection: SYNC_COLLECTION,
    rkey: RKEY,
    record: { $type: SYNC_COLLECTION, account, updatedAt: new Date().toISOString(), ...env },
  })
}

/** Read the sync record, or null if there isn't one yet. Real errors rethrow. */
export async function getSyncState(): Promise<SyncEnvelope | null> {
  const agent = getAgent()
  try {
    const res = await agent.com.atproto.repo.getRecord({
      repo: agent.assertDid,
      collection: SYNC_COLLECTION,
      rkey: RKEY,
    })
    return res.data.value as unknown as SyncEnvelope
  } catch (e) {
    if (isNotFound(e)) return null
    throw e
  }
}

/** Delete the sync record (turning off sync, if the user asks to wipe remote). */
export async function deleteSyncState(): Promise<void> {
  const agent = getAgent()
  try {
    await agent.com.atproto.repo.deleteRecord({
      repo: agent.assertDid,
      collection: SYNC_COLLECTION,
      rkey: RKEY,
    })
  } catch (e) {
    if (!isNotFound(e)) throw e
  }
}

function isNotFound(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return /not\s*found|could not locate|RecordNotFound/i.test(m)
}
