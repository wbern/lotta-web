import { describe, expect, it } from 'vitest'
import { initDatabase } from './db.ts'
import { stripModernColumns } from './legacy-export.ts'
import { createSchema } from './schema.ts'

async function modernDbBytes(): Promise<Uint8Array> {
  const db = await initDatabase()
  createSchema(db)
  db.run(
    `INSERT INTO tournaments (
      tournament, tournamentgroup, pairingsystem, initialpairing, rounds,
      barredpairing, compensateweakplayerpp, chess4, pointspergame, ratingchoice
    ) VALUES ('T', 'A', 'Monrad', 'Rating', 5, '0', '0', '0', 1, 'ELO')`,
  )
  db.run(
    `INSERT INTO tournamentplayers (
      lastname, firstname, tournamentindex, addedatround, protectfrombyeindebut
    ) VALUES ('Andersson', 'Erik', 1, 2, 0)`,
  )
  const bytes = db.export()
  db.close()
  return bytes
}

async function tournamentPlayerColumns(bytes: Uint8Array): Promise<Set<string>> {
  const db = await initDatabase(bytes)
  const cols = db.exec('PRAGMA table_info(tournamentplayers)')
  const names = new Set<string>(cols[0]?.values.map((r) => r[1] as string) ?? [])
  db.close()
  return names
}

describe('stripModernColumns', () => {
  it('drops addedatround and protectfrombyeindebut from tournamentplayers', async () => {
    const before = await tournamentPlayerColumns(await modernDbBytes())
    expect(before.has('addedatround')).toBe(true)
    expect(before.has('protectfrombyeindebut')).toBe(true)

    const stripped = await stripModernColumns(await modernDbBytes())
    const after = await tournamentPlayerColumns(stripped)
    expect(after.has('addedatround')).toBe(false)
    expect(after.has('protectfrombyeindebut')).toBe(false)
  })

  it('preserves the original tournamentplayers row data', async () => {
    const stripped = await stripModernColumns(await modernDbBytes())
    const db = await initDatabase(stripped)
    const result = db.exec('SELECT lastname, firstname FROM tournamentplayers')
    db.close()
    expect(result[0]?.values).toEqual([['Andersson', 'Erik']])
  })

  it('is idempotent — stripping twice does not error', async () => {
    const onceStripped = await stripModernColumns(await modernDbBytes())
    const twiceStripped = await stripModernColumns(onceStripped)
    const cols = await tournamentPlayerColumns(twiceStripped)
    expect(cols.has('addedatround')).toBe(false)
    expect(cols.has('protectfrombyeindebut')).toBe(false)
  })

  it('does not mutate the source bytes', async () => {
    const source = await modernDbBytes()
    const sourceCopy = new Uint8Array(source)
    await stripModernColumns(source)
    expect(source).toEqual(sourceCopy)
  })
})
