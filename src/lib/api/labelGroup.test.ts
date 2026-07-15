import { describe, it, expect } from 'vitest'
import { groupByLabel } from './labelGroup'
import { cleanLabel } from './llm'

describe('groupByLabel', () => {
  it('groups identical labels into one conversation', () => {
    const d = groupByLabel([
      { uri: 'a', label: 'Trump tariffs' },
      { uri: 'b', label: 'Trump tariffs' },
      { uri: 'c', label: 'MF DOOM demo' },
    ])
    expect(d.conversations).toHaveLength(2)
    const tariffs = d.conversations.find((c) => c.label === 'Trump tariffs')!
    expect(tariffs.postUris.sort()).toEqual(['a', 'b'])
  })

  it('merges related labels (subset / singular-plural) under one canonical', () => {
    const d = groupByLabel([
      { uri: 'a', label: 'Trump tariffs' },
      { uri: 'b', label: 'Trump tariff threats' },
      { uri: 'c', label: 'Tariffs' },
    ])
    expect(d.conversations).toHaveLength(1)
    // Canonical = most common wording; here all distinct, so shortest wins ties
    // among count-1 — but "Trump tariffs" and "Tariffs" and "Trump tariff
    // threats" are all count 1, shortest is "Tariffs".
    expect(d.conversations[0].postUris.sort()).toEqual(['a', 'b', 'c'])
  })

  it('keeps unrelated labels apart', () => {
    const d = groupByLabel([
      { uri: 'a', label: 'Climate policy' },
      { uri: 'b', label: 'Baseball trades' },
    ])
    expect(d.conversations).toHaveLength(2)
  })

  it('keeps singletons as one-post conversations', () => {
    const d = groupByLabel([{ uri: 'a', label: 'A lone thought' }])
    expect(d.conversations).toHaveLength(1)
    expect(d.conversations[0].postUris).toEqual(['a'])
  })

  it('picks the most common wording as canonical', () => {
    const d = groupByLabel([
      { uri: 'a', label: 'ICE raids' },
      { uri: 'b', label: 'ICE raids' },
      { uri: 'c', label: 'ICE raid Los Angeles' },
    ])
    expect(d.conversations).toHaveLength(1)
    expect(d.conversations[0].label).toBe('ICE raids')
  })

  it('drops empty labels', () => {
    const d = groupByLabel([
      { uri: 'a', label: '' },
      { uri: 'b', label: 'Real topic' },
    ])
    expect(d.conversations).toHaveLength(1)
    expect(d.conversations[0].postUris).toEqual(['b'])
  })
})

describe('cleanLabel', () => {
  it('strips quotes, prefixes, and trailing punctuation', () => {
    expect(cleanLabel('"Trump tariffs"')).toBe('Trump tariffs')
    expect(cleanLabel('Label: ICE raids')).toBe('ICE raids')
    expect(cleanLabel('Topic: climate.')).toBe('climate')
    expect(cleanLabel('**bold topic**')).toBe('bold topic')
  })
  it('takes the first non-empty line and caps length', () => {
    expect(cleanLabel('\n\nFirst topic\nSecond line')).toBe('First topic')
    expect(cleanLabel('one two three four five six seven')).toBe('one two three four five')
  })
})
