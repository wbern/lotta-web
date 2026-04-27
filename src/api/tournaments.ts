import { generateLiveChessPgn } from '../domain/livechess'
import { getPlayerRating } from '../domain/ratings'
import type { CreateTournamentRequest, TournamentDto, TournamentListItemDto } from '../types/api'
import { getDataProvider } from './active-provider'
import { getDatabaseService, withSave } from './service-provider'

export async function listTournamentsLocal(): Promise<TournamentListItemDto[]> {
  return getDatabaseService().tournaments.list()
}

export async function getTournamentLocal(id: number): Promise<TournamentDto> {
  const result = getDatabaseService().tournaments.get(id)
  if (!result) throw new Error(`Tournament ${id} not found`)
  return result
}

export async function createTournamentLocal(req: CreateTournamentRequest): Promise<TournamentDto> {
  const detail = req.group ? `${req.name} (${req.group})` : req.name
  return withSave(() => getDatabaseService().tournaments.create(req), 'Ny turnering', detail)
}

export async function updateTournamentLocal(
  id: number,
  req: CreateTournamentRequest,
): Promise<TournamentDto> {
  return withSave(
    () => getDatabaseService().tournaments.update(id, req),
    'Uppdatera turnering',
    req.name,
  )
}

export async function deleteTournamentLocal(id: number): Promise<void> {
  const tournament = getDatabaseService().tournaments.get(id)
  return withSave(
    () => getDatabaseService().tournaments.delete(id),
    'Ta bort turnering',
    tournament?.name ?? '',
    { kind: 'tournamentDeleted', tournamentId: id },
  )
}

export async function listTournaments(): Promise<TournamentListItemDto[]> {
  return getDataProvider().tournaments.list()
}

export async function getTournament(id: number): Promise<TournamentDto> {
  return getDataProvider().tournaments.get(id)
}

export async function createTournament(req: CreateTournamentRequest): Promise<TournamentDto> {
  return getDataProvider().tournaments.create(req)
}

export async function updateTournament(
  id: number,
  req: CreateTournamentRequest,
): Promise<TournamentDto> {
  return getDataProvider().tournaments.update(id, req)
}

export async function deleteTournament(id: number): Promise<void> {
  await getDataProvider().tournaments.delete(id)
}

export async function exportTournamentPlayers(id: number): Promise<Blob> {
  const db = getDatabaseService()
  const players = db.tournamentPlayers.list(id)

  let tsv = ''
  for (const p of players) {
    tsv += `${p.lastName}\t${p.firstName}\t${p.club ?? ''}\n`
  }

  const encoder = new TextEncoder()
  const utf8Bytes = encoder.encode(tsv)
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const result = new Uint8Array(bom.length + utf8Bytes.length)
  result.set(bom)
  result.set(utf8Bytes, bom.length)

  return new Blob([result], { type: 'text/tab-separated-values; charset=UTF-8' })
}

export async function exportLiveChess(id: number, round?: number): Promise<Blob> {
  const db = getDatabaseService()
  const tournament = db.tournaments.get(id)
  if (!tournament) throw new Error(`Tournament ${id} not found`)

  const rounds = db.games.listRounds(id)
  const roundNr = round ?? rounds.length
  if (roundNr < 1 || roundNr > rounds.length) {
    throw new Error('No rounds available')
  }

  const roundData = db.games.getRound(id, roundNr)
  if (!roundData) throw new Error(`Round ${roundNr} not found`)

  const players = db.tournamentPlayers.list(id)

  const pgn = generateLiveChessPgn({
    tournamentName: tournament.name,
    roundNr,
    games: roundData.games.map((g) => {
      const wp = g.whitePlayer ? players.find((p) => p.id === g.whitePlayer!.id) : null
      const bp = g.blackPlayer ? players.find((p) => p.id === g.blackPlayer!.id) : null

      return {
        boardNr: g.boardNr,
        whiteLastName: wp?.lastName ?? null,
        whiteFirstName: wp?.firstName ?? null,
        blackLastName: bp?.lastName ?? null,
        blackFirstName: bp?.firstName ?? null,
        whiteRating: wp ? getPlayerRating(wp, tournament.ratingChoice) : 0,
        blackRating: bp ? getPlayerRating(bp, tournament.ratingChoice) : 0,
        resultType: g.resultType,
      }
    }),
  })

  return new Blob([pgn], { type: 'text/plain; charset=UTF-8' })
}

export async function importPlayers(file: File): Promise<{ imported: number }> {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  const content = decodeTsv(bytes)

  return withSave(
    () => {
      const db = getDatabaseService()
      const existingPlayers = db.availablePlayers.list()

      let imported = 0
      const lines = content.split('\n')

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (line === '') continue

        const parts = line.split('\t')
        if (parts.length < 2) continue

        const lastName = parts[0].trim()
        const firstName = parts[1].trim()
        const clubName = parts.length > 2 ? parts[2].trim() : ''

        // Check case-insensitive duplicate
        const isDuplicate = existingPlayers.some(
          (p) =>
            p.lastName.toLowerCase() === lastName.toLowerCase() &&
            p.firstName.toLowerCase() === firstName.toLowerCase(),
        )
        if (isDuplicate) continue

        let clubIndex = 0
        if (clubName !== '') {
          const clubs = db.clubs.list()
          const existing = clubs.find((c) => c.name === clubName)
          if (existing) {
            clubIndex = existing.id
          } else {
            const created = db.clubs.create({ name: clubName })
            clubIndex = created.id
          }
        }

        const player = db.availablePlayers.create({
          lastName,
          firstName,
          clubIndex,
        })
        existingPlayers.push(player)
        imported++
      }

      return { imported }
    },
    'Importera spelare',
    (r) => `${r.imported} spelare`,
  )
}

function decodeTsv(bytes: Uint8Array): string {
  let offset = 0
  // Strip UTF-8 BOM if present
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    offset = 3
  }
  const payload = bytes.subarray(offset)
  // Try strict UTF-8 first. On invalid sequences (Excel-on-Windows default exports
  // are typically Windows-1252), fall back so Swedish characters survive the round-trip.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(payload)
  } catch {
    return new TextDecoder('windows-1252').decode(payload)
  }
}
