import { RichText } from '@atproto/api'
import { getAgent } from './agent'
import { isDemo } from './demo'

/**
 * Detect facets (links, @mentions, #tags) in composed text so the posted record
 * carries them and they render as real links/mentions on Bluesky. Mentions need
 * handle→DID resolution, hence the agent; skipped in demo mode.
 */
export async function detectFacets(text: string): Promise<unknown[] | undefined> {
  if (isDemo()) return undefined
  const rt = new RichText({ text })
  await rt.detectFacets(getAgent())
  return rt.facets
}

export interface Segment {
  text: string
  href?: string
}

/** Split post text into runs using its stored facets, marking links/mentions. */
export function segments(text: string, facets?: unknown): Segment[] {
  const rt = new RichText({ text, facets: facets as never })
  const out: Segment[] = []
  for (const seg of rt.segments()) {
    if (seg.link) out.push({ text: seg.text, href: seg.link.uri })
    else if (seg.mention) out.push({ text: seg.text, href: `https://bsky.app/profile/${seg.mention.did}` })
    else out.push({ text: seg.text })
  }
  return out
}
