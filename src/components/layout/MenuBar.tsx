import { useEffect, useRef, useState } from 'react'
import { usePairNextRound } from '../../hooks/useRounds'
import { Dialog } from '../dialogs/Dialog'

interface Props {
  tournamentId: number | undefined
  roundNr: number | undefined
  chess4?: boolean
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  onShowTimeline?: () => void
  onNewTournament?: () => void
  onEditTournament?: () => void
  onAddGroup?: () => void
  onDeleteTournament?: () => void
  onPlayerPool?: () => void
  onTournamentPlayers?: () => void
  onSettings?: () => void
  onBackup?: () => void
  onRestore?: () => void
  onAddBoard?: () => void
  onEditBoard?: () => void
  onDeleteBoard?: () => void
  onPrint?: (what: string) => void
  onExportPlayers?: () => void
  onImportPlayers?: () => void
  onSeedPlayers?: () => void
  onPublish?: (what: string) => void
  onUnpair?: () => void
}

export function MenuBar({
  tournamentId,
  roundNr,
  chess4,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onShowTimeline,
  onNewTournament,
  onEditTournament,
  onAddGroup,
  onDeleteTournament,
  onPlayerPool,
  onTournamentPlayers,
  onSettings,
  onBackup,
  onRestore,
  onAddBoard,
  onEditBoard,
  onDeleteBoard,
  onPrint,
  onExportPlayers,
  onImportPlayers,
  onSeedPlayers,
  onPublish,
  onUnpair,
}: Props) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [showAbout, setShowAbout] = useState(false)
  const [pairError, setPairError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const pairMutation = usePairNextRound(tournamentId)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggleMenu = (name: string) => {
    setOpenMenu(openMenu === name ? null : name)
  }

  const action = (fn?: () => void) => {
    setOpenMenu(null)
    fn?.()
  }

  const hasTournament = tournamentId != null
  const hasRound = hasTournament && roundNr != null

  return (
    <div className="menu-bar" data-testid="menu-bar" ref={menuRef}>
      {/* 1. Turnering */}
      <div className="menu-item">
        <button onClick={() => toggleMenu('tournament')} aria-expanded={openMenu === 'tournament'}>
          Turnering
        </button>
        {openMenu === 'tournament' && (
          <div className="menu-dropdown" data-testid="menu-dropdown">
            <button onClick={() => action(onNewTournament)}>Ny</button>
            <button onClick={() => action(onAddGroup)} disabled={!hasTournament}>
              Lägg till grupp
            </button>
            <button onClick={() => action(onEditTournament)} disabled={!hasTournament}>
              Editera
            </button>
            <div className="menu-separator" />
            <button onClick={() => action(onDeleteTournament)} disabled={!hasTournament}>
              Ta bort
            </button>
          </div>
        )}
      </div>

      {/* 2. Redigera */}
      <div className="menu-item">
        <button onClick={() => toggleMenu('edit')} aria-expanded={openMenu === 'edit'}>
          Redigera
        </button>
        {openMenu === 'edit' && (
          <div className="menu-dropdown" data-testid="menu-dropdown">
            <button onClick={() => action(onUndo)} disabled={!canUndo}>
              Ångra
              <span className="menu-shortcut">Ctrl+Z</span>
            </button>
            <button onClick={() => action(onRedo)} disabled={!canRedo}>
              Gör om
              <span className="menu-shortcut">Ctrl+Y</span>
            </button>
            <div className="menu-separator" />
            <button onClick={() => action(onShowTimeline)}>Historik...</button>
          </div>
        )}
      </div>

      {/* 3. Lotta */}
      <div className="menu-item">
        <button
          onClick={() => toggleMenu('pairing')}
          aria-expanded={openMenu === 'pairing'}
          disabled={!hasTournament}
        >
          Lotta
        </button>
        {openMenu === 'pairing' && (
          <div className="menu-dropdown" data-testid="menu-dropdown">
            <button
              onClick={() =>
                action(() =>
                  pairMutation.mutate(undefined, {
                    onSuccess: () => setPairError(''),
                    onError: (err) => setPairError(err.message),
                  }),
                )
              }
              disabled={!hasTournament}
            >
              Lotta nästa rond
            </button>
            <div className="menu-separator" />
            <button onClick={() => action(() => onPrint?.('pairings'))} disabled={!hasRound}>
              Skriv ut lottning
            </button>
            <button onClick={() => action(() => onPublish?.('pairings'))} disabled={!hasRound}>
              Publicera lottning
            </button>
            <button onClick={() => action(() => onPrint?.('alphabetical'))} disabled={!hasRound}>
              Skriv ut alfabetisk lottning
            </button>
            <div className="menu-submenu">
              <button disabled={!hasRound}>Publicera alfabetisk lottning ▸</button>
              <div className="menu-submenu-items">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <button
                    key={n}
                    onClick={() => action(() => onPublish?.(`alphabetical?columns=${n}`))}
                    disabled={!hasRound}
                  >
                    {n} {n === 1 ? 'kolumn' : 'kolumner'}
                  </button>
                ))}
              </div>
            </div>
            <div className="menu-separator" />
            <button onClick={() => action(onUnpair)} disabled={!hasTournament}>
              Ångra lottning
            </button>
            <div className="menu-separator" />
            <button onClick={() => action(onAddBoard)} disabled={!hasRound}>
              Lägg till bord
            </button>
            <button onClick={() => action(onEditBoard)} disabled={!hasRound}>
              Editera bord
            </button>
            <button onClick={() => action(onDeleteBoard)} disabled={!hasRound}>
              Ta bort bord
            </button>
          </div>
        )}
      </div>

      {/* 4. Ställning */}
      <div className="menu-item">
        <button
          onClick={() => toggleMenu('standings')}
          aria-expanded={openMenu === 'standings'}
          disabled={!hasTournament}
        >
          Ställning
        </button>
        {openMenu === 'standings' && (
          <div className="menu-dropdown" data-testid="menu-dropdown">
            <button onClick={() => action(() => onPrint?.('standings'))} disabled={!hasTournament}>
              Skriv ut ställning
            </button>
            <button
              onClick={() => action(() => onPublish?.('standings'))}
              disabled={!hasTournament}
            >
              Publicera ställning
            </button>
            <div className="menu-separator" />
            <button onClick={() => action(() => onPublish?.('cross-table'))} disabled={!hasRound}>
              Publicera korstabell
            </button>
            {chess4 ? (
              <>
                <div className="menu-separator" />
                <button
                  onClick={() => action(() => onPrint?.('chess4-standings'))}
                  disabled={!hasTournament}
                >
                  Skriv ut Schack4an-ställning
                </button>
                <button
                  onClick={() => action(() => onPublish?.('chess4-standings'))}
                  disabled={!hasTournament}
                >
                  Publicera Schack4an-ställning
                </button>
              </>
            ) : (
              <>
                <div className="menu-separator" />
                <button
                  onClick={() => action(() => onPrint?.('club-standings'))}
                  disabled={!hasTournament}
                >
                  Skriv ut klubbställning
                </button>
                <button
                  onClick={() => action(() => onPublish?.('club-standings'))}
                  disabled={!hasTournament}
                >
                  Publicera klubbställning
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 5. Spelare */}
      <div className="menu-item">
        <button onClick={() => toggleMenu('players')} aria-expanded={openMenu === 'players'}>
          Spelare
        </button>
        {openMenu === 'players' && (
          <div className="menu-dropdown" data-testid="menu-dropdown">
            <button onClick={() => action(onPlayerPool)}>Spelarpool</button>
            <button onClick={() => action(onTournamentPlayers)} disabled={!hasTournament}>
              Turneringsspelare
            </button>
            <div className="menu-separator" />
            <button onClick={() => action(() => onPrint?.('players'))} disabled={!hasTournament}>
              Skriv ut spelarlista
            </button>
            <button onClick={() => action(() => onPublish?.('players'))} disabled={!hasTournament}>
              Publicera spelarlista
            </button>
            <div className="menu-separator" />
            <button onClick={() => action(onExportPlayers)} disabled={!hasTournament}>
              Exportera turneringsspelare
            </button>
            <button onClick={() => action(onImportPlayers)}>Importera till spelarpool</button>
            <div className="menu-separator" />
            <button onClick={() => action(onSeedPlayers)}>Skapa testspelare</button>
          </div>
        )}
      </div>

      {/* 6. Inställningar */}
      <div className="menu-item">
        <button onClick={() => toggleMenu('settings')} aria-expanded={openMenu === 'settings'}>
          Inställningar
        </button>
        {openMenu === 'settings' && (
          <div className="menu-dropdown" data-testid="menu-dropdown">
            <button onClick={() => action(onSettings)}>Inställningar</button>
            <div className="menu-separator" />
            <button onClick={() => action(onBackup)}>Säkerhetskopiera databas</button>
            <button onClick={() => action(onRestore)}>Återställ databas</button>
          </div>
        )}
      </div>

      {/* 7. Hjälp */}
      <div className="menu-item">
        <button onClick={() => toggleMenu('help')} aria-expanded={openMenu === 'help'}>
          Hjälp
        </button>
        {openMenu === 'help' && (
          <div className="menu-dropdown" data-testid="menu-dropdown">
            <button disabled>Sök efter uppdateringar</button>
            <button
              onClick={() => {
                setOpenMenu(null)
                setShowAbout(true)
              }}
            >
              Om
            </button>
          </div>
        )}
      </div>

      <Dialog
        title="Kan inte lotta"
        open={!!pairError}
        onClose={() => setPairError('')}
        width={400}
        footer={
          <button className="btn" onClick={() => setPairError('')}>
            OK
          </button>
        }
      >
        <p data-testid="pair-error">{pairError}</p>
      </Dialog>

      <Dialog
        title="Om Lotta"
        open={showAbout}
        onClose={() => setShowAbout(false)}
        width={400}
        footer={
          <button className="btn" onClick={() => setShowAbout(false)}>
            Stäng
          </button>
        }
      >
        <p>
          Av{' '}
          <a href="https://william.bernting.se" target="_blank" rel="noopener noreferrer">
            William Bernting
          </a>
          <br />
          <a href="mailto:william@bernting.se">william@bernting.se</a>
          {' | '}
          <a href="tel:+46706676047">070-667 60 47</a>
        </p>
        {(__COMMIT_HASH__ || __GIT_TAG__) && (
          <p className="about-version">
            {__GIT_TAG__ && (
              <>
                Version: {__GIT_TAG__}
                <br />
              </>
            )}
            {__COMMIT_HASH__ && (
              <>
                Commit: {__COMMIT_HASH__}
                {__COMMIT_DATE__ && ` (${__COMMIT_DATE__})`}
              </>
            )}
          </p>
        )}
      </Dialog>
    </div>
  )
}
