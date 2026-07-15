import type { Digest } from './llm'

export interface LabeledPost {
  uri: string
  label: string
}

const STOP = new Set([
  'the', 'a', 'an', 'to', 'of', 'in', 'on', 'and', 'is', 'it', 'for', 'with',
  'that', 'this', 'my', 'i', 'you', 'we', 'they', 'at', 'as', 'be', 'so', 'but',
  'vs', 'about', 're', 'over',
])

/** Content tokens of a label — lowercased, alnum, stopwords dropped, singularized
 * (naive trailing-s strip) so "tariff" and "tariffs" match. */
function tokens(label: string): Set<string> {
  return new Set(
    label
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/s$/, ''))
      .filter((w) => w.length > 1 && !STOP.has(w)),
  )
}

/** Two labels belong together if one token set is a subset of the other, or
 * they overlap by at least half (Jaccard ≥ 0.5). Deterministic, no threshold to
 * tune per-feed and no embedding call — good enough to keep "Trump tariffs" and
 * "Trump tariff threats" from splitting. */
function related(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  if (inter === 0) return false
  if (inter === a.size || inter === b.size) return true // subset either way
  const union = a.size + b.size - inter
  return inter / union >= 0.5
}

function slug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'topic'
  )
}

interface Group {
  toks: Set<string>
  uris: string[]
  /** original label → count, to pick the canonical (most common) wording. */
  labels: Map<string, number>
}

/**
 * Group per-post labels into conversations. Posts whose labels are related
 * (see `related`) merge into one conversation; the canonical label is the most
 * common original wording (ties broken by shortest). Order is deterministic:
 * groups are seeded in input order, so a rebuild as labels stream in is stable.
 * Singletons are kept — a conversation of one post is valid (the graph renders
 * it as a caption under the post rather than a pill).
 */
export function groupByLabel(posts: LabeledPost[]): Digest {
  const groups: Group[] = []
  for (const { uri, label } of posts) {
    if (!label) continue
    const toks = tokens(label)
    let g = groups.find((grp) => related(grp.toks, toks))
    if (!g) {
      g = { toks: new Set(toks), uris: [], labels: new Map() }
      groups.push(g)
    } else {
      for (const t of toks) g.toks.add(t) // grow the group's vocabulary
    }
    if (!g.uris.includes(uri)) g.uris.push(uri)
    g.labels.set(label, (g.labels.get(label) ?? 0) + 1)
  }

  const conversations = groups.map((g) => {
    const canonical = [...g.labels.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].length - b[0].length,
    )[0][0]
    return {
      id: slug(canonical),
      label: canonical,
      summary: '',
      status: 'steady' as const,
      postUris: g.uris,
    }
  })
  return { conversations }
}
