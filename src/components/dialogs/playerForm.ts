import type { PlayerDto } from '../../types/api'

// Shallow value comparison across the union of keys. Callers must keep both
// sides at the same shape (always seed editPlayer and baseline from the same
// source); a key present on one side and absent on the other will register as
// dirty. Safe because PlayerDto is all primitives.
export function samePlayer(a: Partial<PlayerDto>, b: Partial<PlayerDto>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof PlayerDto>
  for (const k of keys) {
    if (a[k] !== b[k]) return false
  }
  return true
}
