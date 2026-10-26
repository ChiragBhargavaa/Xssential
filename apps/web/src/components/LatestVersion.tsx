'use client'

import { useEffect, useState } from 'react'
import { site } from '@/lib/site'

// Fetched client-side so the static site never needs a rebuild after a release
export function LatestVersion() {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    fetch(`https://api.github.com/repos/${site.repo}/releases/latest`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.tag_name && setVersion(data.tag_name))
      .catch(() => {})
  }, [])

  if (!version) return null
  return (
    <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400">
      Latest release {version}
    </span>
  )
}
