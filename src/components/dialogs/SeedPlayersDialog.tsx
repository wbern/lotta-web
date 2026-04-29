import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { seedFakePlayers } from '../../api/seed-players'
import { addTournamentPlayers } from '../../api/tournament-players'
import { generateRandomName } from '../../domain/random-name'
import { useCreateTournament, useTournaments } from '../../hooks/useTournaments'
import type { CreateTournamentRequest } from '../../types/api'
import { useToast } from '../toast/useToast'
import { Dialog } from './Dialog'

const randomTournamentDefaults: Omit<CreateTournamentRequest, 'name' | 'group'> = {
  pairingSystem: 'Nordisk Schweizer',
  initialPairing: 'Rating',
  nrOfRounds: 9,
  barredPairing: false,
  compensateWeakPlayerPP: false,
  pointsPerGame: 1,
  chess4: false,
  ratingChoice: 'ELO',
  showELO: true,
  showGroup: false,
  federation: 'SWE',
  selectedTiebreaks: [],
  resultsPage: 'lottning.htm',
  standingsPage: 'stallning.htm',
  playerListPage: 'spelare.htm',
  roundForRoundPage: 'korstabell.htm',
  clubStandingsPage: 'klubbstallning.htm',
}

interface Props {
  open: boolean
  onClose: () => void
  tournamentId?: number
}

export function SeedPlayersDialog({ open, onClose, tournamentId }: Props) {
  const [count, setCount] = useState(20)
  const [seeding, setSeeding] = useState(false)
  const [autoAdd, setAutoAdd] = useState(true)
  const [createClubs, setCreateClubs] = useState(false)
  const [clubCount, setClubCount] = useState(5)
  const [target, setTarget] = useState<string>('')
  const { data: tournaments } = useTournaments()
  const createTournament = useCreateTournament()
  const queryClient = useQueryClient()
  const { show: showToast } = useToast()

  const handleSeed = async () => {
    setSeeding(true)
    try {
      const { players, clubs } = await seedFakePlayers(count, {
        clubCount: createClubs ? clubCount : undefined,
      })
      queryClient.invalidateQueries({ queryKey: ['players'] })
      if (clubs.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['clubs'] })
      }
      let targetId: number | undefined
      if (target === 'random') {
        const created = await createTournament.mutateAsync({
          name: generateRandomName({ includeYear: true }),
          group: 'Grupp A',
          ...randomTournamentDefaults,
        })
        targetId = created.id
        queryClient.invalidateQueries({ queryKey: ['tournaments'] })
      } else if (target) {
        targetId = Number(target)
      }
      let addedToTournament = false
      if (targetId != null) {
        try {
          await addTournamentPlayers(targetId, players)
          queryClient.invalidateQueries({ queryKey: ['tournaments', targetId, 'players'] })
          queryClient.invalidateQueries({ queryKey: ['tournaments', targetId] })
          addedToTournament = true
        } catch {
          showToast({
            message: `${players.length} testspelare tillagda i spelarpoolen, men kunde inte lägga till dem i turneringen.`,
            variant: 'warning',
            autoDismissMs: 6000,
          })
          return
        }
      } else if (autoAdd && tournamentId != null) {
        try {
          await addTournamentPlayers(tournamentId, players)
          queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'players'] })
          queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId] })
          addedToTournament = true
        } catch {
          showToast({
            message: `${players.length} testspelare tillagda i spelarpoolen, men kunde inte lägga till dem i turneringen.`,
            variant: 'warning',
            autoDismissMs: 6000,
          })
          return
        }
      }
      onClose()
      showToast({
        message: addedToTournament
          ? `${players.length} testspelare tillagda i turneringen.`
          : `${players.length} testspelare tillagda i spelarpoolen.`,
        variant: 'success',
        autoDismissMs: 4000,
      })
    } finally {
      setSeeding(false)
    }
  }

  return (
    <Dialog
      title="Skapa testspelare"
      open={open}
      onClose={onClose}
      width={360}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose} disabled={seeding}>
            Avbryt
          </button>
          <button className="btn btn-primary" onClick={handleSeed} disabled={seeding || count < 1}>
            {seeding ? 'Skapar...' : 'Skapa'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p>Lägg till slumpmässiga testspelare i spelarpoolen för demosyfte.</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Antal spelare:
          <input
            type="number"
            min={1}
            max={500}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value))))}
            style={{ width: 80 }}
          />
        </label>
        <label
          data-testid="seed-create-clubs"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <input
            type="checkbox"
            checked={createClubs}
            onChange={(e) => setCreateClubs(e.target.checked)}
          />
          Skapa slumpmässiga klubbar
        </label>
        {createClubs && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 24 }}>
            Antal klubbar:
            <input
              data-testid="seed-club-count"
              type="number"
              min={1}
              max={50}
              value={clubCount}
              onChange={(e) => setClubCount(Math.max(1, Math.min(50, Number(e.target.value))))}
              style={{ width: 80 }}
            />
          </label>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Lägg till i turnering:
          <select
            data-testid="seed-target-select"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">Ingen turnering (endast spelarpool)</option>
            {(tournaments ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} / {t.group}
              </option>
            ))}
            <option value="random">Skapa ny slumpmässig turnering</option>
          </select>
        </label>
        {tournamentId != null && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={autoAdd}
              onChange={(e) => setAutoAdd(e.target.checked)}
            />
            Lägg även till i turneringen
          </label>
        )}
      </div>
    </Dialog>
  )
}
