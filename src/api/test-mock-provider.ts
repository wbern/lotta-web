import { vi } from 'vitest'
import type { DataProvider } from './data-provider'

/**
 * Build a DataProvider whose methods are all vi.fn() stubs. Overrides merge
 * per namespace so tests only need to declare the methods they actually use.
 */
export function createMockProvider(
  overrides: {
    [K in keyof DataProvider]?: Partial<NonNullable<DataProvider[K]>>
  } = {},
): DataProvider {
  return {
    tournaments: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      ...overrides.tournaments,
    },
    tournamentPlayers: {
      list: vi.fn(),
      add: vi.fn(),
      addMany: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      removeMany: vi.fn(),
      ...overrides.tournamentPlayers,
    },
    rounds: {
      list: vi.fn(),
      get: vi.fn(),
      pairNext: vi.fn(),
      unpairLast: vi.fn(),
      ...overrides.rounds,
    },
    results: {
      set: vi.fn(),
      addGame: vi.fn(),
      updateGame: vi.fn(),
      deleteGame: vi.fn(),
      deleteGames: vi.fn(),
      ...overrides.results,
    },
    standings: {
      get: vi.fn(),
      getClub: vi.fn(),
      getChess4: vi.fn(),
      ...overrides.standings,
    },
    clubs: {
      list: vi.fn(),
      add: vi.fn(),
      rename: vi.fn(),
      delete: vi.fn(),
      ...overrides.clubs,
    },
    settings: {
      get: vi.fn(),
      update: vi.fn(),
      ...overrides.settings,
    },
    poolPlayers: {
      list: vi.fn(),
      add: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      ...overrides.poolPlayers,
    },
    undo: {
      perform: vi.fn(),
      redo: vi.fn(),
      restoreToPoint: vi.fn(),
      ...overrides.undo,
    },
    commands: overrides.commands as DataProvider['commands'],
  }
}
