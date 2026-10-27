import { useEffect, useState } from 'react'
import type { ScreenAccess } from '../../../shared/tools'

// The screen recording permission, re-checked on an interval and whenever the window
// gets focus (for example after coming back from System Settings). Null until known.
export function useScreenAccess(intervalMs = 1500): ScreenAccess | null {
  const [access, setAccess] = useState<ScreenAccess | null>(null)
  useEffect(() => {
    let alive = true
    const check = () => {
      window.api.permissions.screen().then((a) => {
        if (alive) setAccess(a)
      })
    }
    check()
    const timer = setInterval(check, intervalMs)
    window.addEventListener('focus', check)
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener('focus', check)
    }
  }, [intervalMs])
  return access
}
