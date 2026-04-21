import { useVersions } from '../../hooks/useVersions'
import { Dialog } from './Dialog'

interface Props {
  open: boolean
  onClose: () => void
  onSwitch: (version: string) => void
}

export function RollbackDialog({ open, onClose, onSwitch }: Props) {
  const { data: versions, isLoading } = useVersions()

  return (
    <Dialog
      title="Byt till tidigare version"
      open={open}
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>
          Stäng
        </button>
      }
    >
      {isLoading && <p data-testid="rollback-loading">Läser in tillgängliga versioner…</p>}
      {!isLoading && (!versions || versions.length === 0) && (
        <p data-testid="rollback-empty">
          Inga tidigare versioner tillgängliga. Äldre versioner dyker upp här när nya versioner
          publiceras.
        </p>
      )}
      {!isLoading && versions && versions.length > 0 && (
        <>
          <div className="rollback-warning" data-testid="rollback-warning" role="alert">
            <p>
              <strong>Den äldre versionen har sin egen databas.</strong> Din nuvarande data rörs
              inte, men den äldre versionen ser den inte heller — den kör mot en separat lagring och
              startar tom.
            </p>
            <p>
              Vill du ta med dig dina turneringar dit? Ladda ner en säkerhetskopia via Inställningar
              → Säkerhetskopiera, och importera den sedan i den äldre versionen. Gör det på egen
              risk — äldre versioner kan misstolka nyare databasformat.
            </p>
          </div>
          <ul className="rollback-version-list">
            {versions.map((v) => (
              <li
                key={v.version}
                className="rollback-version-row"
                data-testid={`rollback-version-${v.version}`}
              >
                <span className="rollback-version-label">v{v.version}</span>
                {v.date && <span className="rollback-version-date">({v.date})</span>}
                <button
                  className="btn btn-primary"
                  data-testid={`rollback-switch-${v.version}`}
                  onClick={() => onSwitch(v.version)}
                >
                  Byt till v{v.version}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  )
}
