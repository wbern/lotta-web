import { useEffect, useState } from 'react'
import { generateRandomName } from '../../domain/random-name'
import { isFieldLocked, tournamentLockState } from '../../domain/tournament-lock'
import { useCreateTournament, useTournament, useUpdateTournament } from '../../hooks/useTournaments'
import { sv } from '../../lib/swedish-text'
import type { CreateTournamentRequest } from '../../types/api'
import { IconButton } from '../IconButton'
import { Dialog } from './Dialog'

interface Props {
  open: boolean
  tournamentId: number | undefined // undefined = create new
  initialName?: string
  presetFromTournamentId?: number
  onClose: () => void
  onCreated?: (id: number) => void
}

const ALL_TIEBREAKS = [
  'Berger',
  'Buchholz',
  'Median Buchholz',
  'SSF Buchholz',
  'Inbördes möte',
  'Progressiv',
  'Vinster',
  'Prestationsrating LASK',
  'Svarta partier',
  'Manuell',
  'Random',
]

const RATING_CHOICES = [
  'ELO',
  'Snabb-ELO',
  'Blixt-ELO',
  'Snabb-ELO annars ELO',
  'Blixt-ELO annars ELO',
]

type PointSystemPreset = 'standard' | 'schack4an' | 'skollags' | 'manual'

function detectPointSystemPreset(chess4: boolean, pointsPerGame: number): PointSystemPreset {
  if (!chess4 && pointsPerGame === 1) return 'standard'
  if (chess4 && pointsPerGame === 4) return 'schack4an'
  if (!chess4 && pointsPerGame === 2) return 'skollags'
  return 'manual'
}

const defaults: CreateTournamentRequest = {
  name: '',
  group: '',
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

export function TournamentDialog({
  open,
  tournamentId,
  initialName,
  presetFromTournamentId,
  onClose,
  onCreated,
}: Props) {
  const { data: existing } = useTournament(tournamentId)
  const { data: presetTournament } = useTournament(presetFromTournamentId)
  const createMutation = useCreateTournament()
  const updateMutation = useUpdateTournament()

  const [form, setForm] = useState<CreateTournamentRequest>(defaults)
  const [activeTab, setActiveTab] = useState<'settings' | 'web' | 'fide'>('settings')
  const [manualMode, setManualMode] = useState(false)
  const [preChess4, setPreChess4] = useState<Partial<CreateTournamentRequest> | null>(null)
  const [selectedAvailable, setSelectedAvailable] = useState<string | null>(null)
  const [selectedChosen, setSelectedChosen] = useState<string | null>(null)
  const [newRoundNr, setNewRoundNr] = useState(1)
  const [newRoundDate, setNewRoundDate] = useState('')
  const [saveError, setSaveError] = useState('')

  const isEdit = tournamentId != null
  const lockState = isEdit && existing ? tournamentLockState(existing) : 'draft'
  const scoringLocked = isFieldLocked('chess4', lockState)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return
    if (isEdit && existing) {
      setForm({
        name: existing.name,
        group: existing.group,
        pairingSystem: existing.pairingSystem,
        initialPairing: existing.initialPairing,
        nrOfRounds: existing.nrOfRounds,
        barredPairing: existing.barredPairing,
        compensateWeakPlayerPP: existing.compensateWeakPlayerPP,
        pointsPerGame: existing.pointsPerGame,
        chess4: existing.chess4,
        ratingChoice: existing.ratingChoice,
        showELO: existing.showELO,
        showGroup: existing.showGroup,
        city: existing.city,
        startDate: existing.startDate || undefined,
        endDate: existing.endDate || undefined,
        chiefArbiter: existing.chiefArbiter,
        deputyArbiter: existing.deputyArbiter,
        timeControl: existing.timeControl,
        federation: existing.federation,
        selectedTiebreaks: existing.selectedTiebreaks,
        resultsPage: existing.resultsPage,
        standingsPage: existing.standingsPage,
        playerListPage: existing.playerListPage,
        roundForRoundPage: existing.roundForRoundPage,
        clubStandingsPage: existing.clubStandingsPage,
        roundDates: existing.roundDates,
      })
      setManualMode(detectPointSystemPreset(existing.chess4, existing.pointsPerGame) === 'manual')
    } else if (!isEdit) {
      if (presetTournament) {
        setForm({
          name: initialName ?? '',
          group: '',
          pairingSystem: presetTournament.pairingSystem,
          initialPairing: presetTournament.initialPairing,
          nrOfRounds: presetTournament.nrOfRounds,
          barredPairing: presetTournament.barredPairing,
          compensateWeakPlayerPP: presetTournament.compensateWeakPlayerPP,
          pointsPerGame: presetTournament.pointsPerGame,
          chess4: presetTournament.chess4,
          ratingChoice: presetTournament.ratingChoice,
          showELO: presetTournament.showELO,
          showGroup: presetTournament.showGroup,
          city: presetTournament.city,
          startDate: presetTournament.startDate || undefined,
          endDate: presetTournament.endDate || undefined,
          chiefArbiter: presetTournament.chiefArbiter,
          deputyArbiter: presetTournament.deputyArbiter,
          timeControl: presetTournament.timeControl,
          federation: presetTournament.federation,
          selectedTiebreaks: presetTournament.selectedTiebreaks,
          resultsPage: presetTournament.resultsPage,
          standingsPage: presetTournament.standingsPage,
          playerListPage: presetTournament.playerListPage,
          roundForRoundPage: presetTournament.roundForRoundPage,
          clubStandingsPage: presetTournament.clubStandingsPage,
          roundDates: presetTournament.roundDates,
        })
        setManualMode(
          detectPointSystemPreset(presetTournament.chess4, presetTournament.pointsPerGame) ===
            'manual',
        )
      } else {
        setForm({ ...defaults, name: initialName ?? '' })
        setManualMode(false)
      }
    }
  }, [existing, isEdit, open, presetTournament, initialName])
  /* eslint-enable react-hooks/set-state-in-effect */

  const update = (fields: Partial<CreateTournamentRequest>) => {
    setForm({ ...form, ...fields })
    if (saveError) setSaveError('')
  }

  const handlePresetChange = (preset: PointSystemPreset) => {
    if (preset === 'manual') {
      setManualMode(true)
      return
    }
    setManualMode(false)
    if (preset === 'schack4an') {
      handleChess4Toggle(true)
    } else if (preset === 'skollags') {
      update({ chess4: false, ...(preChess4 || {}), pointsPerGame: 2 })
      if (preChess4) setPreChess4(null)
    } else if (preset === 'standard') {
      update({ chess4: false, ...(preChess4 || {}), pointsPerGame: 1 })
      if (preChess4) setPreChess4(null)
    }
  }

  const currentPreset: PointSystemPreset = manualMode
    ? 'manual'
    : detectPointSystemPreset(form.chess4, form.pointsPerGame)

  const handleChess4Toggle = (checked: boolean) => {
    setManualMode(false)
    if (checked) {
      // Only snapshot on the false→true edge. Re-entering chess4 from a
      // detour through Anpassad would otherwise overwrite the original
      // pre-chess4 snapshot with the current chess4-mode form.
      if (!form.chess4) {
        setPreChess4({
          pairingSystem: form.pairingSystem,
          initialPairing: form.initialPairing,
          ratingChoice: form.ratingChoice,
          showELO: form.showELO,
          showGroup: form.showGroup,
          selectedTiebreaks: form.selectedTiebreaks,
          barredPairing: form.barredPairing,
          compensateWeakPlayerPP: form.compensateWeakPlayerPP,
          pointsPerGame: form.pointsPerGame,
        })
      }
      update({
        chess4: true,
        pairingSystem: 'Monrad',
        initialPairing: 'Slumpad',
        ratingChoice: 'ELO',
        showELO: false,
        showGroup: false,
        selectedTiebreaks: ['SSF Buchholz'],
        barredPairing: true,
        compensateWeakPlayerPP: false,
        pointsPerGame: 4,
      })
    } else {
      // Restore saved values, falling back to standard 1 ppg if none saved
      update({
        chess4: false,
        pointsPerGame: 1,
        ...(preChess4 || {}),
      })
      setPreChess4(null)
    }
  }

  const selectedTiebreaks = form.selectedTiebreaks || []
  const availableTiebreaks = ALL_TIEBREAKS.filter((t) => !selectedTiebreaks.includes(t))

  const addTiebreak = () => {
    if (selectedAvailable && !selectedTiebreaks.includes(selectedAvailable)) {
      update({ selectedTiebreaks: [...selectedTiebreaks, selectedAvailable] })
      setSelectedAvailable(null)
    }
  }

  const removeTiebreak = () => {
    if (selectedChosen) {
      update({ selectedTiebreaks: selectedTiebreaks.filter((t) => t !== selectedChosen) })
      setSelectedChosen(null)
    }
  }

  const moveTiebreak = (direction: -1 | 1) => {
    if (!selectedChosen) return
    const idx = selectedTiebreaks.indexOf(selectedChosen)
    if (idx < 0) return
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= selectedTiebreaks.length) return
    const copy = [...selectedTiebreaks]
    ;[copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]]
    update({ selectedTiebreaks: copy })
  }

  const handleSave = () => {
    if (!form.name.trim() || !form.group.trim()) {
      setSaveError(sv.tournament.nameAndGroupRequired)
      return
    }
    if (isEdit && tournamentId != null) {
      updateMutation.mutate({ id: tournamentId, req: form }, { onSuccess: () => onClose() })
    } else {
      createMutation.mutate(form, {
        onSuccess: (data) => {
          onCreated?.(data.id)
          onClose()
        },
      })
    }
  }

  return (
    <Dialog
      title="Turneringsinställningar"
      open={open}
      onClose={onClose}
      width={620}
      isDirty={isEdit || form.name !== '' || form.group !== ''}
      footer={
        <>
          <button className="btn btn-primary" onClick={handleSave}>
            {sv.common.save}
          </button>
          <button className="btn" onClick={onClose}>
            {sv.common.cancel}
          </button>
        </>
      }
    >
      {/* Turnering and Grupp above tabs */}
      {saveError && (
        <div
          data-testid="tournament-save-error"
          style={{
            color: 'var(--color-danger)',
            fontSize: 'var(--font-size-small)',
            marginBottom: 8,
          }}
        >
          {saveError}
        </div>
      )}
      <div className="form-group">
        <label>
          Turnering<span className="required-asterisk">*</span>
        </label>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            data-testid="tournament-name-input"
            type="text"
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            style={{ flex: 1 }}
          />
          <IconButton
            data-testid="randomize-name"
            onClick={() => update({ name: generateRandomName() })}
            title="Slumpa namn"
          >
            &#x1f3b2;
          </IconButton>
        </div>
      </div>
      <div className="form-group">
        <label>
          {sv.columns.group}
          <span className="required-asterisk">*</span>
        </label>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            data-testid="tournament-group-input"
            type="text"
            value={form.group}
            onChange={(e) => update({ group: e.target.value })}
            style={{ flex: 1 }}
          />
          <IconButton
            data-testid="randomize-group"
            onClick={() => update({ group: generateRandomName({ includeYear: false }) })}
            title="Slumpa grupp"
          >
            &#x1f3b2;
          </IconButton>
        </div>
      </div>

      <div className="dialog-tabs">
        <button
          className={`dialog-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Lottningsinställningar
        </button>
        <button
          className={`dialog-tab ${activeTab === 'web' ? 'active' : ''}`}
          onClick={() => setActiveTab('web')}
        >
          Webbpublicering
        </button>
        <button
          className={`dialog-tab ${activeTab === 'fide' ? 'active' : ''}`}
          onClick={() => setActiveTab('fide')}
        >
          FIDE-uppgifter
        </button>
      </div>

      {activeTab === 'settings' && (
        <div style={{ paddingTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <input
              data-testid="tournament-chess4-checkbox"
              type="checkbox"
              checked={form.chess4}
              onChange={(e) => handleChess4Toggle(e.target.checked)}
              disabled={scoringLocked}
            />
            {sv.tournament.chess4}
          </label>
          <div className="form-group">
            <label>Poängsystem</label>
            <select
              data-testid="tournament-point-system-select"
              value={currentPreset}
              onChange={(e) => handlePresetChange(e.target.value as PointSystemPreset)}
              disabled={scoringLocked}
            >
              <option value="standard">Standard (1-½-0)</option>
              <option value="schack4an">Schack4an (3-2-1)</option>
              <option value="skollags">Skollags-DM (2-1-0)</option>
              <option value="manual">Anpassad</option>
            </select>
            {scoringLocked && (
              <div
                data-testid="scoring-locked-hint"
                style={{
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--font-size-small)',
                  marginTop: 4,
                }}
              >
                Poängsystem och övriga lottningsinställningar är låsta efter att rond 1 har lottats.
                Duplicera turneringen för att ändra dessa.
              </div>
            )}
          </div>

          <div className="form-group">
            <label>{sv.tournament.pairingSystem}</label>
            <select
              data-testid="tournament-pairing-system-select"
              value={form.pairingSystem}
              onChange={(e) => update({ pairingSystem: e.target.value })}
              disabled={form.chess4 || isFieldLocked('pairingSystem', lockState)}
            >
              <option value="Monrad">Monrad</option>
              <option value="Berger">Berger</option>
              <option value="Nordisk Schweizer">Nordisk Schweizer</option>
            </select>
          </div>

          <div className="form-group">
            <label>{sv.tournament.initialPairing}</label>
            <select
              data-testid="tournament-initial-pairing-select"
              value={form.initialPairing}
              onChange={(e) => update({ initialPairing: e.target.value })}
              disabled={form.chess4 || isFieldLocked('initialPairing', lockState)}
            >
              <option value="Slumpad">Slumpad</option>
              <option value="Rating">Rating</option>
            </select>
          </div>

          <div className="form-row" style={{ alignItems: 'flex-end', marginBottom: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>{sv.tournament.ratingChoice}</label>
              <select
                data-testid="tournament-rating-choice-select"
                value={form.ratingChoice}
                onChange={(e) => update({ ratingChoice: e.target.value })}
                disabled={form.chess4 || isFieldLocked('ratingChoice', lockState)}
              >
                {RATING_CHOICES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                whiteSpace: 'nowrap',
                paddingBottom: 4,
              }}
            >
              <input
                type="checkbox"
                checked={form.showELO}
                onChange={(e) => update({ showELO: e.target.checked })}
                disabled={form.chess4}
              />
              {sv.tournament.showELO}
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                whiteSpace: 'nowrap',
                paddingBottom: 4,
              }}
            >
              <input
                type="checkbox"
                checked={form.showGroup}
                onChange={(e) => update({ showGroup: e.target.checked })}
                disabled={form.chess4}
              />
              {sv.tournament.showGroup}
            </label>
          </div>

          <div className="form-group">
            <label>{sv.tournament.nrOfRounds}</label>
            <input
              data-testid="tournament-nr-of-rounds-input"
              type="number"
              value={form.nrOfRounds}
              min={Math.max(1, existing?.roundsPlayed ?? 0)}
              onChange={(e) => update({ nrOfRounds: Number(e.target.value) })}
              style={{ width: 80 }}
            />
          </div>

          {/* Tiebreak management */}
          <div className="form-group">
            <label>{sv.tournament.tiebreaks}</label>
            <div className="tiebreak-panel">
              <div className="tiebreak-list-container">
                <div className="tiebreak-list-label">{sv.tournament.availableTiebreaks}</div>
                <select
                  data-testid="tournament-tiebreak-available-list"
                  className="tiebreak-list"
                  size={8}
                  value={selectedAvailable || ''}
                  onChange={(e) => {
                    setSelectedAvailable(e.target.value || null)
                    setSelectedChosen(null)
                  }}
                  onDoubleClick={addTiebreak}
                  disabled={form.chess4 || isFieldLocked('selectedTiebreaks', lockState)}
                >
                  {availableTiebreaks.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="tiebreak-buttons">
                <button
                  className="btn"
                  onClick={addTiebreak}
                  disabled={
                    form.chess4 ||
                    !selectedAvailable ||
                    isFieldLocked('selectedTiebreaks', lockState)
                  }
                >
                  &gt;&gt;
                </button>
                <button
                  className="btn"
                  onClick={removeTiebreak}
                  disabled={
                    form.chess4 || !selectedChosen || isFieldLocked('selectedTiebreaks', lockState)
                  }
                >
                  &lt;&lt;
                </button>
              </div>

              <div className="tiebreak-list-container">
                <div className="tiebreak-list-label">{sv.tournament.selectedTiebreaks}</div>
                <select
                  data-testid="tournament-tiebreak-selected-list"
                  className="tiebreak-list"
                  size={8}
                  value={selectedChosen || ''}
                  onChange={(e) => {
                    setSelectedChosen(e.target.value || null)
                    setSelectedAvailable(null)
                  }}
                  onDoubleClick={removeTiebreak}
                  disabled={form.chess4 || isFieldLocked('selectedTiebreaks', lockState)}
                >
                  {selectedTiebreaks.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="tiebreak-buttons">
                <button
                  className="btn"
                  onClick={() => moveTiebreak(-1)}
                  disabled={
                    form.chess4 || !selectedChosen || isFieldLocked('selectedTiebreaks', lockState)
                  }
                >
                  Upp
                </button>
                <button
                  className="btn"
                  onClick={() => moveTiebreak(1)}
                  disabled={
                    form.chess4 || !selectedChosen || isFieldLocked('selectedTiebreaks', lockState)
                  }
                >
                  Ner
                </button>
              </div>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <input
              data-testid="tournament-barred-pairing-checkbox"
              type="checkbox"
              checked={form.barredPairing}
              onChange={(e) => update({ barredPairing: e.target.checked })}
              disabled={isFieldLocked('barredPairing', lockState)}
            />
            {sv.tournament.barredPairing}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <input
              data-testid="tournament-compensate-weak-checkbox"
              type="checkbox"
              checked={form.compensateWeakPlayerPP}
              onChange={(e) => update({ compensateWeakPlayerPP: e.target.checked })}
              disabled={form.chess4 || isFieldLocked('compensateWeakPlayerPP', lockState)}
            />
            {sv.tournament.compensateWeak}
          </label>

          {manualMode && (
            <div className="form-group">
              <label>{sv.tournament.pointsPerGame}</label>
              <input
                data-testid="tournament-points-per-game-input"
                type="number"
                value={form.pointsPerGame}
                min={1}
                onChange={(e) => update({ pointsPerGame: Number(e.target.value) })}
                disabled={form.chess4 || scoringLocked}
                style={{ width: 80 }}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'web' && (
        <div style={{ paddingTop: 8 }}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>
            Dessa uppgifter behövs endast om man vill publicera sidor på internet.
          </p>
          <div className="form-group">
            <label>Lottning html-fil</label>
            <input
              type="text"
              value={form.resultsPage || ''}
              onChange={(e) => update({ resultsPage: e.target.value })}
              placeholder="lottning.htm"
            />
          </div>
          <div className="form-group">
            <label>Ställning html-fil</label>
            <input
              type="text"
              value={form.standingsPage || ''}
              onChange={(e) => update({ standingsPage: e.target.value })}
              placeholder="stallning.htm"
            />
          </div>
          <div className="form-group">
            <label>Spelarlista html-fil</label>
            <input
              type="text"
              value={form.playerListPage || ''}
              onChange={(e) => update({ playerListPage: e.target.value })}
              placeholder="spelare.htm"
            />
          </div>
          <div className="form-group">
            <label>Korstabell html-fil</label>
            <input
              type="text"
              value={form.roundForRoundPage || ''}
              onChange={(e) => update({ roundForRoundPage: e.target.value })}
              placeholder="korstabell.htm"
            />
          </div>
          <div className="form-group">
            <label>Klubbställning html-fil (Schack4an ställning)</label>
            <input
              type="text"
              value={form.clubStandingsPage || ''}
              onChange={(e) => update({ clubStandingsPage: e.target.value })}
              placeholder="klubbstallning.htm"
            />
          </div>
        </div>
      )}

      {activeTab === 'fide' && (
        <div style={{ paddingTop: 8 }}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>
            Uppgifter för ELO-registrering till FIDE
          </p>
          <div className="form-group">
            <label>Stad</label>
            <input
              type="text"
              value={form.city || ''}
              onChange={(e) => update({ city: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Federation</label>
            <input
              type="text"
              value={form.federation || ''}
              onChange={(e) => update({ federation: e.target.value })}
              style={{ width: 80 }}
            />
          </div>
          <div className="form-group">
            <label>Startdatum</label>
            <input
              type="text"
              value={form.startDate || ''}
              onChange={(e) => update({ startDate: e.target.value })}
              placeholder="YYYY-MM-DD"
              style={{ width: 120 }}
            />
          </div>
          <div className="form-group">
            <label>Slutdatum</label>
            <input
              type="text"
              value={form.endDate || ''}
              onChange={(e) => update({ endDate: e.target.value })}
              placeholder="YYYY-MM-DD"
              style={{ width: 120 }}
            />
          </div>
          <div className="form-group">
            <label>Huvuddomare</label>
            <input
              type="text"
              value={form.chiefArbiter || ''}
              onChange={(e) => update({ chiefArbiter: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>{sv.tournament.deputyArbiter}</label>
            <input
              type="text"
              value={form.deputyArbiter || ''}
              onChange={(e) => update({ deputyArbiter: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Betänketid</label>
            <input
              type="text"
              value={form.timeControl || ''}
              onChange={(e) => update({ timeControl: e.target.value })}
            />
          </div>

          {/* Round dates */}
          <div className="form-group">
            <label>Speldatum för ronder</label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <div className="form-row" style={{ marginBottom: 4 }}>
                  <div
                    style={{
                      textAlign: 'center',
                      fontSize: 'var(--font-size-small)',
                      fontWeight: 600,
                    }}
                  >
                    Rond
                  </div>
                  <div
                    style={{
                      textAlign: 'center',
                      fontSize: 'var(--font-size-small)',
                      fontWeight: 600,
                    }}
                  >
                    Datum
                  </div>
                </div>
                <div className="form-row">
                  <input
                    type="number"
                    min={1}
                    value={newRoundNr}
                    onChange={(e) => setNewRoundNr(Number(e.target.value))}
                    style={{ width: 50 }}
                  />
                  <input
                    type="text"
                    value={newRoundDate}
                    onChange={(e) => setNewRoundDate(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    style={{ width: 100 }}
                  />
                </div>
              </div>
              <div className="tiebreak-buttons">
                <button
                  className="btn"
                  disabled={!newRoundDate || newRoundNr < 1}
                  onClick={() => {
                    const existing = (form.roundDates || []).filter((r) => r.round !== newRoundNr)
                    update({
                      roundDates: [...existing, { round: newRoundNr, date: newRoundDate }].sort(
                        (a, b) => a.round - b.round,
                      ),
                    })
                    setNewRoundNr(newRoundNr + 1)
                    setNewRoundDate('')
                  }}
                >
                  &gt;&gt;
                </button>
                <button
                  className="btn"
                  disabled={!selectedChosen}
                  onClick={() => {
                    const rd = form.roundDates || []
                    if (rd.length > 0) {
                      update({ roundDates: rd.slice(0, -1) })
                    }
                  }}
                >
                  &lt;&lt;
                </button>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 'var(--font-size-small)',
                    fontWeight: 600,
                    textAlign: 'center',
                    marginBottom: 2,
                  }}
                >
                  Rondlista
                </div>
                <select
                  size={6}
                  style={{
                    width: 140,
                    font: 'inherit',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--border-radius)',
                  }}
                  disabled
                >
                  {(form.roundDates || []).map((rd) => (
                    <option key={rd.round} value={rd.round}>
                      r{rd.round}: {rd.date}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}
