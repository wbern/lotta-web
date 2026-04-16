import { useEffect, useMemo, useState } from 'react'
import {
  type ChangelogEntry,
  type ChangelogType,
  entriesSince,
  fetchChangelog,
  groupByDate,
  groupByType,
} from '../../domain/changelog'
import { Dialog } from './Dialog'

interface Props {
  open: boolean
  onClose: () => void
}

const GROUP_ICONS: Record<ChangelogType, string> = {
  feat: '✨',
  fix: '🐛',
  perf: '⚡',
}

export function WhatsNewDialog({ open, onClose }: Props) {
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null)
  const [showOlder, setShowOlder] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setEntries(null)
    setShowOlder(false)
    fetchChangelog(import.meta.env.BASE_URL).then((data) => {
      if (!cancelled) setEntries(data)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  const newer = useMemo(
    () => (entries ? entriesSince(entries, __COMMIT_HASH__, __COMMIT_DATE__) : []),
    [entries],
  )
  const hasOlder = entries !== null && entries.length > newer.length
  const visible = showOlder ? (entries ?? []) : newer
  const days = groupByDate(visible)

  return (
    <Dialog
      title="Vad är nytt"
      open={open}
      onClose={onClose}
      width={520}
      height={480}
      footer={
        <button className="btn" onClick={onClose}>
          Stäng
        </button>
      }
    >
      {entries === null && <p>Laddar ändringslogg…</p>}
      {entries !== null && days.length === 0 && <p>Inga nya ändringar sedan din version.</p>}
      {days.length > 0 && (
        <div className="changelog-archive">
          {days.map((day) => (
            <section key={day.date} className="changelog-day">
              <h3>{day.date}</h3>
              {groupByType(day.entries).map((group) => (
                <div key={group.type} className="changelog-group" data-testid="changelog-group">
                  <h4>
                    <span className="changelog-group-icon" aria-hidden="true">
                      {GROUP_ICONS[group.type]}
                    </span>
                    {group.label}
                  </h4>
                  <ul>
                    {group.entries.map((entry) => (
                      <li key={entry.sha}>
                        {entry.breaking && <strong>Brytande ändring: </strong>}
                        {entry.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
      {hasOlder && !showOlder && (
        <p className="changelog-show-older">
          <button type="button" className="link-button" onClick={() => setShowOlder(true)}>
            Visa tidigare versioner
          </button>
        </p>
      )}
    </Dialog>
  )
}
