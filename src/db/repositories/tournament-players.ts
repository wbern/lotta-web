import type { Database } from 'sql.js'
import { tournamentLockState } from '../../domain/tournament-lock.ts'
import type { PlayerDto } from '../../types/api.ts'
import { mapPlayerRow } from './map-player-row.ts'

export class TournamentPlayerRepository {
  private db: Database
  constructor(db: Database) {
    this.db = db
  }

  add(tournamentId: number, dto: Partial<PlayerDto>): PlayerDto {
    this.assertCanAdd(tournamentId)
    this.db.run(
      `INSERT INTO tournamentplayers (
        lastname, firstname, clubindex, ratingn, ratingi, ratingq, ratingb,
        ratingk, ratingkq, ratingkb, title, sex, federation, fideid, ssfid,
        birthdate, playergroup, tournamentindex, withdrawnfromround, manualtiebreak
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dto.lastName ?? '',
        dto.firstName ?? '',
        dto.clubIndex && dto.clubIndex > 0 ? dto.clubIndex : null,
        dto.ratingN ?? 0,
        dto.ratingI ?? 0,
        dto.ratingQ ?? 0,
        dto.ratingB ?? 0,
        dto.ratingK ?? 0,
        dto.ratingKQ ?? 0,
        dto.ratingKB ?? 0,
        dto.title ?? '',
        dto.sex ?? null,
        dto.federation ?? '',
        dto.fideId ?? 0,
        dto.ssfId ?? 0,
        dto.birthdate ?? null,
        dto.playerGroup ?? '',
        tournamentId,
        dto.withdrawnFromRound ?? -1,
        dto.manualTiebreak ?? 0,
      ],
    )
    const idResult = this.db.exec('SELECT last_insert_rowid()')
    const id = idResult[0].values[0][0] as number
    return this.get(id)!
  }

  addMany(tournamentId: number, dtos: Partial<PlayerDto>[]): PlayerDto[] {
    return dtos.map((dto) => this.add(tournamentId, dto))
  }

  get(id: number): PlayerDto | null {
    const result = this.db.exec(
      `SELECT
        p."index", p.lastname, p.firstname, c.club, COALESCE(p.clubindex, 0),
        p.ratingn, p.ratingi, p.ratingq, p.ratingb, p.ratingk, p.ratingkq, p.ratingkb,
        p.title, p.sex, p.federation, p.fideid, p.ssfid, p.birthdate, p.playergroup,
        COALESCE(p.withdrawnfromround, -1), COALESCE(p.manualtiebreak, 0)
      FROM tournamentplayers p
      LEFT JOIN clubs c ON c."index" = p.clubindex
      WHERE p."index" = ?`,
      [id],
    )
    if (result.length === 0) return null
    return this.mapRow(result[0].values[0])
  }

  update(id: number, dto: Partial<PlayerDto>): PlayerDto {
    const fields: string[] = []
    const values: (string | number | null)[] = []

    const fieldMap: Record<string, string> = {
      lastName: 'lastname',
      firstName: 'firstname',
      clubIndex: 'clubindex',
      ratingN: 'ratingn',
      ratingI: 'ratingi',
      ratingQ: 'ratingq',
      ratingB: 'ratingb',
      ratingK: 'ratingk',
      ratingKQ: 'ratingkq',
      ratingKB: 'ratingkb',
      title: 'title',
      sex: 'sex',
      federation: 'federation',
      fideId: 'fideid',
      ssfId: 'ssfid',
      birthdate: 'birthdate',
      playerGroup: 'playergroup',
      withdrawnFromRound: 'withdrawnfromround',
      manualTiebreak: 'manualtiebreak',
    }

    for (const [dtoField, dbColumn] of Object.entries(fieldMap)) {
      const value = dto[dtoField as keyof PlayerDto]
      if (value !== undefined) {
        fields.push(`${dbColumn} = ?`)
        values.push(value)
      }
    }

    if (fields.length > 0) {
      values.push(id)
      this.db.run(`UPDATE tournamentplayers SET ${fields.join(', ')} WHERE "index" = ?`, values)
    }

    return this.get(id)!
  }

  private assertCanAdd(tournamentId: number): void {
    const info = this.db.exec(
      `SELECT
        t.pairingsystem,
        (SELECT COUNT(DISTINCT g.round) FROM tournamentgames g WHERE g.tournament = t."index"),
        (SELECT COUNT(*) FROM tournamentgames g WHERE g.tournament = t."index" AND g.resulttype != 0),
        t.rounds
      FROM tournaments t WHERE t."index" = ?`,
      [tournamentId],
    )
    if (!info[0]?.values.length) return
    const [pairingSystem, roundsPlayed, resultCount, nrOfRounds] = info[0].values[0] as [
      string,
      number,
      number,
      number,
    ]
    if (pairingSystem !== 'Berger') return
    const state = tournamentLockState({
      roundsPlayed,
      hasRecordedResults: resultCount > 0,
      nrOfRounds,
    })
    if (state === 'draft') return
    throw new Error(
      'I en Berger-turnering måste alla spelare läggas till innan lottning. ' +
        'Ångra lottning för att lägga till spelare.',
    )
  }

  remove(id: number): void {
    const tInfo = this.db.exec(
      `SELECT
        (SELECT COUNT(DISTINCT g.round) FROM tournamentgames g WHERE g.tournament = t."index"),
        (SELECT COUNT(*) FROM tournamentgames g WHERE g.tournament = t."index" AND g.resulttype != 0),
        t.rounds
      FROM tournaments t
      JOIN tournamentplayers p ON p.tournamentindex = t."index"
      WHERE p."index" = ?`,
      [id],
    )
    // Empty tInfo means the player (or their tournament) doesn't exist; fall
    // through to the FK guard + DELETE, which will silently no-op as before.
    if (tInfo[0]?.values.length) {
      const [roundsPlayed, resultCount, nrOfRounds] = tInfo[0].values[0] as [number, number, number]
      const state = tournamentLockState({
        roundsPlayed,
        hasRecordedResults: resultCount > 0,
        nrOfRounds,
      })
      if (state !== 'draft') {
        throw new Error(
          `Cannot remove player ${id}: tournament is ${state}. ` +
            `Withdraw the player instead (utgår från rond).`,
        )
      }
    }

    // Defense-in-depth: games can only exist once a round is lotted, which
    // moves the tournament out of `draft` and is already blocked above. This
    // guard would only fire if the lock-state check above is ever loosened or
    // bypassed, so it's a backstop, not the primary protection.
    const refs = this.db.exec(
      'SELECT COUNT(*) FROM tournamentgames WHERE whiteplayer = ? OR blackplayer = ?',
      [id, id],
    )
    const referencingGames = (refs[0]?.values[0][0] as number) ?? 0
    if (referencingGames > 0) {
      throw new Error(
        `Cannot remove player ${id}: ${referencingGames} game(s) reference them. ` +
          `Withdraw the player instead via withdrawnFromRound.`,
      )
    }
    this.db.run('DELETE FROM tournamentplayers WHERE "index" = ?', [id])
  }

  removeMany(ids: number[]): void {
    for (const id of ids) this.remove(id)
  }

  list(tournamentId: number): PlayerDto[] {
    const result = this.db.exec(
      `SELECT
        p."index", p.lastname, p.firstname, c.club, COALESCE(p.clubindex, 0),
        p.ratingn, p.ratingi, p.ratingq, p.ratingb, p.ratingk, p.ratingkq, p.ratingkb,
        p.title, p.sex, p.federation, p.fideid, p.ssfid, p.birthdate, p.playergroup,
        COALESCE(p.withdrawnfromround, -1), COALESCE(p.manualtiebreak, 0)
      FROM tournamentplayers p
      LEFT JOIN clubs c ON c."index" = p.clubindex
      WHERE p.tournamentindex = ?
      ORDER BY p.lastname, p.firstname`,
      [tournamentId],
    )
    if (result.length === 0) return []
    return result[0].values.map((row) => this.mapRow(row))
  }

  private mapRow(row: unknown[]): PlayerDto {
    return mapPlayerRow(row, true)
  }
}
