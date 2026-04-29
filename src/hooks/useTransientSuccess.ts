import { useEffect, useRef, useState } from 'react'

/**
 * Returns `true` for `ms` after `isSuccess` rises from false to true; otherwise `false`.
 * Rising-edge only — repeat-true renders within an active window do not extend it,
 * and an `isSuccess=true` initial mount does NOT flash (no rising edge has occurred).
 */
export function useTransientSuccess(isSuccess: boolean, ms = 1500): boolean {
  const [active, setActive] = useState(false)
  const prevSuccess = useRef(isSuccess)

  useEffect(() => {
    if (isSuccess && !prevSuccess.current) {
      setActive(true)
      const timer = setTimeout(() => setActive(false), ms)
      prevSuccess.current = isSuccess
      return () => clearTimeout(timer)
    }
    prevSuccess.current = isSuccess
  }, [isSuccess, ms])

  return active
}
