import { getAgent } from './agent'
import { isDemo } from './demo'

export interface ProfileView {
  did: string
  viewer?: { following?: string }
}

/** Fetch full profiles (authoritative viewer/follow state) for up to 25 dids. */
export async function getProfiles(dids: string[]): Promise<ProfileView[]> {
  if (isDemo() || dids.length === 0) return []
  const res = await getAgent().getProfiles({ actors: dids })
  return res.data.profiles
}
