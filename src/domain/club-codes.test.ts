import { describe, expect, it } from 'vitest'
import { generateClubCodeMap } from './club-codes'

describe('generateClubCodeMap', () => {
  it('returns one 4-digit code per entry, all unique', () => {
    const entries = ['SK Lansen', 'Kungsbacka SS', 'Gothenborg SK', '__CLUBLESS__']
    const map = generateClubCodeMap(entries, 'room-secret')

    expect(Object.keys(map).sort()).toEqual([...entries].sort())
    for (const entry of entries) {
      expect(map[entry]).toMatch(/^\d{4}$/)
    }
    const codes = new Set(Object.values(map))
    expect(codes.size).toBe(entries.length)
  })

  it('is deterministic — same entries + secret produce the same map', () => {
    const entries = ['SK Lansen', 'Kungsbacka SS']
    const map1 = generateClubCodeMap(entries, 'secret')
    const map2 = generateClubCodeMap(entries, 'secret')
    expect(map1).toEqual(map2)
  })

  it('resolves collisions across 50 entries while keeping all codes unique', () => {
    const entries = Array.from({ length: 50 }, (_, i) => `Club ${i}`)
    const map = generateClubCodeMap(entries, 'collision-test')
    const codes = new Set(Object.values(map))
    expect(codes.size).toBe(entries.length)
    for (const code of codes) {
      expect(code).toMatch(/^\d{4}$/)
    }
  })
})
