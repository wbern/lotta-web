import { useState } from 'react'
import { Dialog } from './Dialog'

interface Props {
  open: boolean
  hasRound: boolean
  hasTournament: boolean
  chess4: boolean
  category: 'lotta' | 'standings'
  onClose: () => void
  onPublish: (what: string) => void
}

export function PublishDialog({
  open,
  hasRound,
  hasTournament,
  chess4,
  category,
  onClose,
  onPublish,
}: Props) {
  const [alphaColumns, setAlphaColumns] = useState(2)
  const [alphaGroupByClass, setAlphaGroupByClass] = useState(true)
  const [alphaCompact, setAlphaCompact] = useState(false)

  const publish = (what: string) => {
    onPublish(what)
    onClose()
  }

  const publishAlphabetical = () => {
    const params = new URLSearchParams()
    params.set('columns', String(alphaColumns))
    params.set('groupByClass', alphaGroupByClass ? '1' : '0')
    params.set('compact', alphaCompact ? '1' : '0')
    publish(`alphabetical?${params.toString()}`)
  }

  return (
    <Dialog
      title="Publicera"
      open={open}
      onClose={onClose}
      width={400}
      footer={
        <button className="btn" onClick={onClose}>
          Stäng
        </button>
      }
    >
      {category === 'lotta' && (
        <>
          <div className="form-group">
            <button
              className="btn"
              data-testid="publish-pairings"
              onClick={() => publish('pairings')}
              disabled={!hasRound}
            >
              Lottning
            </button>
          </div>
          <div
            className="form-group"
            style={{ flexDirection: 'row', gap: 8, alignItems: 'stretch' }}
          >
            <button
              className="btn"
              data-testid="publish-alphabetical"
              onClick={publishAlphabetical}
              disabled={!hasRound}
              style={{ flex: 1 }}
            >
              Alfabetisk lottning
            </button>
            <select
              aria-label="Antal kolumner"
              data-testid="publish-alphabetical-columns"
              value={alphaColumns}
              onChange={(e) => setAlphaColumns(Number(e.target.value))}
              disabled={alphaGroupByClass}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? '1 kolumn' : `${n} kolumner`}
                </option>
              ))}
            </select>
          </div>
          <div
            className="form-group"
            style={{ flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                data-testid="publish-alphabetical-group-by-class"
                checked={alphaGroupByClass}
                onChange={(e) => setAlphaGroupByClass(e.target.checked)}
              />
              Gruppera per klubb på egen sida
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                data-testid="publish-alphabetical-compact"
                checked={alphaCompact}
                onChange={(e) => setAlphaCompact(e.target.checked)}
              />
              Kompakt vy
            </label>
          </div>
        </>
      )}
      {category === 'standings' && (
        <>
          <div className="form-group">
            <button
              className="btn"
              data-testid="publish-standings"
              onClick={() => publish('standings')}
              disabled={!hasTournament}
            >
              Ställning
            </button>
          </div>
          <div className="form-group">
            <button
              className="btn"
              data-testid="publish-cross-table"
              onClick={() => publish('cross-table')}
              disabled={!hasRound}
            >
              Korstabell
            </button>
          </div>
          <div className="form-group">
            {chess4 ? (
              <button
                className="btn"
                data-testid="publish-chess4-standings"
                onClick={() => publish('chess4-standings')}
                disabled={!hasTournament}
              >
                Schack4an-ställning
              </button>
            ) : (
              <button
                className="btn"
                data-testid="publish-club-standings"
                onClick={() => publish('club-standings')}
                disabled={!hasTournament}
              >
                Klubbställning
              </button>
            )}
          </div>
        </>
      )}
    </Dialog>
  )
}
