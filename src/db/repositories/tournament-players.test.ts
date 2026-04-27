import type { Database } from 'sql.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initDatabase } from '../db.ts'
import { createSchema } from '../schema.ts'
import { TournamentPlayerRepository } from './tournament-players.ts'

describe('TournamentPlayerRepository', () => {
  let db: Database
  let tournamentPlayers: TournamentPlayerRepository
  let tournamentId: number

  beforeEach(async () => {
    db = await initDatabase()
    createSchema(db)
    db.run("INSERT INTO clubs (club, chess4members) VALUES ('SK Rockaden', 0)")
    db.run(
      `INSERT INTO tournaments (tournament, tournamentgroup, pairingsystem, initialpairing, rounds, barredpairing, compensateweakplayerpp, chess4, pointspergame, ratingchoice, showelo, showgroup)
       VALUES ('Test', 'A', 'Monrad', 'Slumpad', 7, 'false', 'false', 'false', 1, 'ELO', 'true', 'true')`,
    )
    const idResult = db.exec('SELECT last_insert_rowid()')
    tournamentId = idResult[0].values[0][0] as number
    tournamentPlayers = new TournamentPlayerRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  it('returns empty list when no players exist', () => {
    expect(tournamentPlayers.list(tournamentId)).toEqual([])
  })

  it('adds a player to a tournament and lists it', () => {
    const added = tournamentPlayers.add(tournamentId, {
      lastName: 'Andersson',
      firstName: 'Erik',
      clubIndex: 1,
      ratingN: 1800,
    })

    expect(added.id).toEqual(expect.any(Number))
    expect(added.lastName).toBe('Andersson')
    expect(added.club).toBe('SK Rockaden')
    expect(added.ratingN).toBe(1800)
    expect(added.withdrawnFromRound).toBe(-1)

    const list = tournamentPlayers.list(tournamentId)
    expect(list).toHaveLength(1)
    expect(list[0].lastName).toBe('Andersson')
  })

  it('adds multiple players to a tournament in batch', () => {
    const results = tournamentPlayers.addMany(tournamentId, [
      { lastName: 'Andersson', firstName: 'Erik', clubIndex: 1, ratingN: 1800 },
      { lastName: 'Bergström', firstName: 'Anna', clubIndex: 1, ratingN: 1600 },
    ])

    expect(results).toHaveLength(2)
    expect(results[0].lastName).toBe('Andersson')
    expect(results[1].lastName).toBe('Bergström')

    const list = tournamentPlayers.list(tournamentId)
    expect(list).toHaveLength(2)
  })

  it('removes multiple players from a tournament in batch', () => {
    const p1 = tournamentPlayers.add(tournamentId, { lastName: 'Andersson', firstName: 'Erik' })
    const p2 = tournamentPlayers.add(tournamentId, { lastName: 'Bergström', firstName: 'Anna' })
    tournamentPlayers.add(tournamentId, { lastName: 'Carlsson', firstName: 'Sven' })

    tournamentPlayers.removeMany([p1.id, p2.id])

    const list = tournamentPlayers.list(tournamentId)
    expect(list).toHaveLength(1)
    expect(list[0].lastName).toBe('Carlsson')
  })

  it('permits removal in draft phase (no rounds lotted yet)', () => {
    const p1 = tournamentPlayers.add(tournamentId, { lastName: 'Andersson', firstName: 'Erik' })

    tournamentPlayers.remove(p1.id)

    expect(tournamentPlayers.get(p1.id)).toBeNull()
  })

  it('refuses to remove a player who has games — phase gate fires before FK guard', () => {
    const p1 = tournamentPlayers.add(tournamentId, { lastName: 'Andersson', firstName: 'Erik' })
    const p2 = tournamentPlayers.add(tournamentId, { lastName: 'Bergström', firstName: 'Anna' })
    db.run(
      `INSERT INTO tournamentgames
        (tournament, round, boardnr, whiteplayer, blackplayer, resulttype, whitescore, blackscore)
        VALUES (?, 1, 1, ?, ?, 0, 0, 0)`,
      [tournamentId, p1.id, p2.id],
    )

    // Phase gate's specific wording — proves we hit it, not the FK guard.
    expect(() => tournamentPlayers.remove(p1.id)).toThrow(/tournament is seeded/)
    expect(tournamentPlayers.get(p1.id)).not.toBeNull()
  })

  it('refuses to remove a player once the tournament is in_progress', () => {
    const p1 = tournamentPlayers.add(tournamentId, { lastName: 'Andersson', firstName: 'Erik' })
    const p2 = tournamentPlayers.add(tournamentId, { lastName: 'Bergström', firstName: 'Anna' })
    const p3 = tournamentPlayers.add(tournamentId, { lastName: 'Carlsson', firstName: 'Sven' })
    // Round 1 played, p1 vs p2 has a recorded result; p3 had a bye and no game ref.
    db.run(
      `INSERT INTO tournamentgames
        (tournament, round, boardnr, whiteplayer, blackplayer, resulttype, whitescore, blackscore)
        VALUES (?, 1, 1, ?, ?, 1, 1, 0)`,
      [tournamentId, p1.id, p2.id],
    )

    expect(() => tournamentPlayers.remove(p3.id)).toThrow(/utgår från rond/i)
    expect(tournamentPlayers.get(p3.id)).not.toBeNull()
  })

  it('refuses to remove a player once round 1 is seeded, even with no recorded results', () => {
    const p1 = tournamentPlayers.add(tournamentId, { lastName: 'Andersson', firstName: 'Erik' })
    const p2 = tournamentPlayers.add(tournamentId, { lastName: 'Bergström', firstName: 'Anna' })
    const p3 = tournamentPlayers.add(tournamentId, { lastName: 'Carlsson', firstName: 'Sven' })
    // Round 1 lottad but unplayed: resulttype = 0 means no result recorded yet.
    // p3 has no game ref (would be the bye-receiver in an odd-numbered field).
    db.run(
      `INSERT INTO tournamentgames
        (tournament, round, boardnr, whiteplayer, blackplayer, resulttype, whitescore, blackscore)
        VALUES (?, 1, 1, ?, ?, 0, 0, 0)`,
      [tournamentId, p1.id, p2.id],
    )

    expect(() => tournamentPlayers.remove(p3.id)).toThrow(/utgår från rond/i)
    expect(tournamentPlayers.get(p3.id)).not.toBeNull()
  })

  it('refuses to remove a player once the tournament is finalized', () => {
    const p1 = tournamentPlayers.add(tournamentId, { lastName: 'Andersson', firstName: 'Erik' })
    const p2 = tournamentPlayers.add(tournamentId, { lastName: 'Bergström', firstName: 'Anna' })
    // Tournament is set up with `rounds = 7`; insert 7 distinct rounds with
    // recorded results so lock state derives to `finalized`.
    for (let r = 1; r <= 7; r++) {
      db.run(
        `INSERT INTO tournamentgames
          (tournament, round, boardnr, whiteplayer, blackplayer, resulttype, whitescore, blackscore)
          VALUES (?, ?, 1, ?, ?, 1, 1, 0)`,
        [tournamentId, r, p1.id, p2.id],
      )
    }

    expect(() => tournamentPlayers.remove(p1.id)).toThrow(/tournament is finalized/)
    expect(tournamentPlayers.get(p1.id)).not.toBeNull()
  })

  it('removeMany also refuses once the tournament is past draft', () => {
    const p1 = tournamentPlayers.add(tournamentId, { lastName: 'Andersson', firstName: 'Erik' })
    const p2 = tournamentPlayers.add(tournamentId, { lastName: 'Bergström', firstName: 'Anna' })
    const p3 = tournamentPlayers.add(tournamentId, { lastName: 'Carlsson', firstName: 'Sven' })
    db.run(
      `INSERT INTO tournamentgames
        (tournament, round, boardnr, whiteplayer, blackplayer, resulttype, whitescore, blackscore)
        VALUES (?, 1, 1, ?, ?, 0, 0, 0)`,
      [tournamentId, p1.id, p2.id],
    )

    expect(() => tournamentPlayers.removeMany([p3.id])).toThrow(/utgår från rond/i)
    expect(tournamentPlayers.get(p3.id)).not.toBeNull()
  })
})
