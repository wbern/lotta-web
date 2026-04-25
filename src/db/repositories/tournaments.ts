import type { Database } from 'sql.js'
import { tournamentLockState } from '../../domain/tournament-lock.ts'
import type {
  CreateTournamentRequest,
  TournamentDto,
  TournamentListItemDto,
} from '../../types/api.ts'

function sameTiebreakOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export class TournamentRepository {
  private db: Database
  constructor(db: Database) {
    this.db = db
  }

  list(): TournamentListItemDto[] {
    const result = this.db.exec(`
      SELECT
        t."index",
        t.tournament,
        t.tournamentgroup,
        t.pairingsystem,
        t.rounds,
        (SELECT COUNT(DISTINCT g.round) FROM tournamentgames g WHERE g.tournament = t."index") as roundsPlayed,
        (SELECT COUNT(*) FROM tournamentplayers p WHERE p.tournamentindex = t."index") as playerCount
      FROM tournaments t
      ORDER BY t.tournament, t.tournamentgroup
    `)
    if (result.length === 0) return []
    return result[0].values.map((row) => {
      const roundsPlayed = row[5] as number
      const nrOfRounds = row[4] as number
      return {
        id: row[0] as number,
        name: row[1] as string,
        group: row[2] as string,
        pairingSystem: row[3] as string,
        nrOfRounds,
        roundsPlayed,
        playerCount: row[6] as number,
        finished: roundsPlayed >= nrOfRounds && nrOfRounds > 0,
      }
    })
  }

  private tournamentParams(req: CreateTournamentRequest): (string | number | null)[] {
    return [
      req.name,
      req.group,
      req.pairingSystem,
      req.initialPairing ?? 'Slumpad',
      req.nrOfRounds,
      String(req.barredPairing),
      String(req.compensateWeakPlayerPP),
      String(req.chess4),
      req.pointsPerGame,
      req.ratingChoice,
      String(req.showELO),
      String(req.showGroup),
      req.city ?? null,
      req.startDate ?? null,
      req.endDate ?? null,
      req.chiefArbiter ?? null,
      req.deputyArbiter ?? null,
      req.timeControl ?? null,
      req.federation ?? null,
      req.resultsPage ?? null,
      req.standingsPage ?? null,
      req.playerListPage ?? null,
      req.roundForRoundPage ?? null,
      req.clubStandingsPage ?? null,
    ]
  }

  create(req: CreateTournamentRequest): TournamentDto {
    this.db.run(
      `INSERT INTO tournaments (
        tournament, tournamentgroup, pairingsystem, initialpairing,
        rounds, barredpairing, compensateweakplayerpp, chess4,
        pointspergame, ratingchoice, showelo, showgroup,
        city, startdate, enddate, chiefarbiter, deputyarbiter,
        timecontrol, federation, resultspage, standingspage,
        playerlistpage, roundforroundpage, clubstandingspage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      this.tournamentParams(req),
    )
    const idResult = this.db.exec('SELECT last_insert_rowid()')
    const id = idResult[0].values[0][0] as number

    if (req.selectedTiebreaks) {
      for (const tb of req.selectedTiebreaks) {
        this.db.run('INSERT INTO tournamenttiebreaks (tiebreak, tournamentindex) VALUES (?, ?)', [
          tb,
          id,
        ])
      }
    }

    if (req.roundDates) {
      for (const rd of req.roundDates) {
        this.db.run(
          'INSERT INTO tournamentrounddates (tournament, round, rounddate) VALUES (?, ?, ?)',
          [id, rd.round, rd.date],
        )
      }
    }

    return this.get(id)!
  }

  update(id: number, req: CreateTournamentRequest): TournamentDto {
    const current = this.get(id)

    if (current && tournamentLockState(current) !== 'draft') {
      if (current.chess4 !== req.chess4 || current.pointsPerGame !== req.pointsPerGame) {
        throw new Error('Kan inte ändra poängsystem efter att rond 1 har lottats.')
      }
      if (current.pairingSystem !== req.pairingSystem) {
        throw new Error('Kan inte ändra lottningssystem efter att rond 1 har lottats.')
      }
      if (current.initialPairing !== req.initialPairing) {
        throw new Error('Kan inte ändra startlottning efter att rond 1 har lottats.')
      }
      if (current.barredPairing !== req.barredPairing) {
        throw new Error('Kan inte ändra lottningsregler efter att rond 1 har lottats.')
      }
      if (current.compensateWeakPlayerPP !== req.compensateWeakPlayerPP) {
        throw new Error(
          'Kan inte ändra kompensation för svagare spelare efter att rond 1 har lottats.',
        )
      }
      if (current.ratingChoice !== req.ratingChoice) {
        throw new Error('Kan inte ändra ratingval efter att rond 1 har lottats.')
      }
      if (req.nrOfRounds < current.roundsPlayed) {
        throw new Error('Kan inte minska antal ronder under antalet redan lottade ronder.')
      }
      const reqTiebreaks = req.selectedTiebreaks ?? []
      if (!sameTiebreakOrder(current.selectedTiebreaks, reqTiebreaks)) {
        throw new Error('Kan inte ändra särskiljning efter att rond 1 har lottats.')
      }
    }

    this.db.run(
      `UPDATE tournaments SET
        tournament = ?, tournamentgroup = ?, pairingsystem = ?, initialpairing = ?,
        rounds = ?, barredpairing = ?, compensateweakplayerpp = ?, chess4 = ?,
        pointspergame = ?, ratingchoice = ?, showelo = ?, showgroup = ?,
        city = ?, startdate = ?, enddate = ?, chiefarbiter = ?, deputyarbiter = ?,
        timecontrol = ?, federation = ?, resultspage = ?, standingspage = ?,
        playerlistpage = ?, roundforroundpage = ?, clubstandingspage = ?
      WHERE "index" = ?`,
      [...this.tournamentParams(req), id],
    )

    this.db.run('DELETE FROM tournamenttiebreaks WHERE tournamentindex = ?', [id])
    if (req.selectedTiebreaks) {
      for (const tb of req.selectedTiebreaks) {
        this.db.run('INSERT INTO tournamenttiebreaks (tiebreak, tournamentindex) VALUES (?, ?)', [
          tb,
          id,
        ])
      }
    }

    this.db.run('DELETE FROM tournamentrounddates WHERE tournament = ?', [id])
    if (req.roundDates) {
      for (const rd of req.roundDates) {
        this.db.run(
          'INSERT INTO tournamentrounddates (tournament, round, rounddate) VALUES (?, ?, ?)',
          [id, rd.round, rd.date],
        )
      }
    }

    return this.get(id)!
  }

  delete(id: number): void {
    this.db.run('DELETE FROM tournamenttiebreaks WHERE tournamentindex = ?', [id])
    this.db.run('DELETE FROM tournamentrounddates WHERE tournament = ?', [id])
    this.db.run('DELETE FROM tournamentgames WHERE tournament = ?', [id])
    this.db.run('DELETE FROM tournamentplayers WHERE tournamentindex = ?', [id])
    this.db.run('DELETE FROM tournaments WHERE "index" = ?', [id])
  }

  get(id: number): TournamentDto | null {
    const result = this.db.exec(
      `SELECT
        t."index", t.tournament, t.tournamentgroup, t.pairingsystem,
        t.initialpairing, t.rounds, t.barredpairing, t.compensateweakplayerpp,
        t.pointspergame, t.chess4, t.ratingchoice, t.showelo, t.showgroup,
        t.city, t.startdate, t.enddate, t.chiefarbiter, t.deputyarbiter,
        t.timecontrol, t.federation, t.resultspage, t.standingspage,
        t.playerlistpage, t.roundforroundpage, t.clubstandingspage,
        (SELECT COUNT(DISTINCT g.round) FROM tournamentgames g WHERE g.tournament = t."index") as roundsPlayed,
        (SELECT COUNT(*) FROM tournamentplayers p WHERE p.tournamentindex = t."index") as playerCount,
        (SELECT COUNT(*) FROM tournamentgames g WHERE g.tournament = t."index" AND g.resulttype != 0) as resultCount
      FROM tournaments t
      WHERE t."index" = ?`,
      [id],
    )
    if (result.length === 0) return null
    const row = result[0].values[0]

    const tbResult = this.db.exec(
      'SELECT tiebreak FROM tournamenttiebreaks WHERE tournamentindex = ? ORDER BY "index"',
      [id],
    )
    const selectedTiebreaks =
      tbResult.length > 0 ? tbResult[0].values.map((r) => r[0] as string) : []

    const rdResult = this.db.exec(
      'SELECT round, rounddate FROM tournamentrounddates WHERE tournament = ? ORDER BY round',
      [id],
    )
    const roundDates =
      rdResult.length > 0
        ? rdResult[0].values.map((r) => ({
            round: r[0] as number,
            date: r[1] as string,
          }))
        : []

    const roundsPlayed = row[25] as number
    const resultCount = row[27] as number
    const nrOfRounds = row[5] as number

    return {
      id: row[0] as number,
      name: row[1] as string,
      group: row[2] as string,
      pairingSystem: row[3] as string,
      initialPairing: row[4] as string,
      nrOfRounds,
      barredPairing: row[6] === 'true',
      compensateWeakPlayerPP: row[7] === 'true',
      pointsPerGame: row[8] as number,
      chess4: row[9] === 'true',
      ratingChoice: row[10] as string,
      showELO: row[11] === 'true',
      showGroup: row[12] === 'true',
      city: (row[13] as string) ?? '',
      startDate: (row[14] as string) ?? null,
      endDate: (row[15] as string) ?? null,
      chiefArbiter: (row[16] as string) ?? '',
      deputyArbiter: (row[17] as string) ?? '',
      timeControl: (row[18] as string) ?? '',
      federation: (row[19] as string) ?? '',
      resultsPage: (row[20] as string) ?? '',
      standingsPage: (row[21] as string) ?? '',
      playerListPage: (row[22] as string) ?? '',
      roundForRoundPage: (row[23] as string) ?? '',
      clubStandingsPage: (row[24] as string) ?? '',
      roundsPlayed,
      playerCount: row[26] as number,
      finished: roundsPlayed >= nrOfRounds && nrOfRounds > 0,
      hasRecordedResults: resultCount > 0,
      selectedTiebreaks,
      roundDates,
    }
  }
}
