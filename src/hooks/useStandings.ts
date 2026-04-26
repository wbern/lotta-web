import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/results'
import * as standingsApi from '../api/standings'
import type { SetResultRequest } from '../types/api'
import { roundKeys } from './useRounds'

const standingKeys = {
  standings: (tournamentId: number, round?: number) =>
    ['tournaments', tournamentId, 'standings', round] as const,
  clubStandings: (tournamentId: number, round?: number) =>
    ['tournaments', tournamentId, 'club-standings', round] as const,
  chess4Standings: (tournamentId: number, round?: number) =>
    ['tournaments', tournamentId, 'chess4-standings', round] as const,
}

export function useStandings(tournamentId: number | undefined, round?: number) {
  return useQuery({
    queryKey: standingKeys.standings(tournamentId!, round),
    queryFn: () => standingsApi.getStandings(tournamentId!, round),
    enabled: tournamentId != null,
  })
}

export function useClubStandings(tournamentId: number | undefined, round?: number) {
  return useQuery({
    queryKey: standingKeys.clubStandings(tournamentId!, round),
    queryFn: () => standingsApi.getClubStandings(tournamentId!, round),
    enabled: tournamentId != null,
  })
}

export function useChess4Standings(tournamentId: number | undefined, round?: number) {
  return useQuery({
    queryKey: standingKeys.chess4Standings(tournamentId!, round),
    queryFn: () => standingsApi.getChess4Standings(tournamentId!, round),
    enabled: tournamentId != null,
  })
}

export function useSetResult(tournamentId: number | undefined, roundNr: number | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ boardNr, req }: { boardNr: number; req: SetResultRequest }) => {
      if (tournamentId == null || roundNr == null) throw new Error('No round selected')
      return api.setResult(tournamentId, roundNr, boardNr, req)
    },
    scope: { id: 'set-result' },
    onSuccess: () => {
      if (tournamentId == null || roundNr == null) return
      qc.invalidateQueries({ queryKey: roundKeys.list(tournamentId) })
      qc.invalidateQueries({ queryKey: roundKeys.detail(tournamentId, roundNr) })
      qc.invalidateQueries({
        queryKey: ['tournaments', tournamentId, 'standings'],
        exact: false,
      })
      qc.invalidateQueries({
        queryKey: ['tournaments', tournamentId, 'club-standings'],
        exact: false,
      })
      qc.invalidateQueries({
        queryKey: ['tournaments', tournamentId, 'chess4-standings'],
        exact: false,
      })
    },
  })
}
