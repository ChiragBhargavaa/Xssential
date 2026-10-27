import { useCallback, useEffect, useState } from 'react'
import type { XAccount } from '../../../shared/tools'
import { useWindowEvent } from './hooks'

// Whether Xssential is signed in to X. Re-checked when the window gets focus, since signing
// in or out happens in X's own window. Null until known.
export function useXAccount(): [XAccount | null, () => void] {
  const [account, setAccount] = useState<XAccount | null>(null)
  const refresh = useCallback(() => {
    window.api.x.account().then(setAccount)
  }, [])
  useEffect(refresh, [refresh])
  useWindowEvent('focus', refresh)
  return [account, refresh]
}
