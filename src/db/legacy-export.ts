import { initDatabase } from './db.ts'

const MODERN_TOURNAMENT_PLAYER_COLUMNS = ['addedatround', 'protectfrombyeindebut'] as const

export async function stripModernColumns(sourceBytes: Uint8Array): Promise<Uint8Array> {
  const db = await initDatabase(sourceBytes)
  try {
    const cols = db.exec('PRAGMA table_info(tournamentplayers)')
    const present = new Set<string>(cols[0]?.values.map((r) => r[1] as string) ?? [])
    for (const col of MODERN_TOURNAMENT_PLAYER_COLUMNS) {
      if (present.has(col)) {
        db.run(`ALTER TABLE tournamentplayers DROP COLUMN ${col}`)
      }
    }
    return db.export()
  } finally {
    db.close()
  }
}
