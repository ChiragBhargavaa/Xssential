'use client'

import { useEffect, useState } from 'react'
import { downloads, releasesUrl, type Platform } from '@/lib/site'

function detectPlatform(): Platform | null {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'mac'
  if (ua.includes('win')) return 'windows'
  return null
}

export function DownloadButtons() {
  const [platform, setPlatform] = useState<Platform | null>(null)

  useEffect(() => setPlatform(detectPlatform()), [])

  // Put the visitor's OS first; default order is macOS, Windows
  const order: Platform[] = platform === 'windows' ? ['windows', 'mac'] : ['mac', 'windows']

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        {order.map((p, i) => {
          const primary = platform ? p === platform : i === 0
          return (
            <a
              key={p}
              href={downloads[p].file}
              className={
                primary
                  ? 'rounded-xl bg-white px-6 py-3 text-center font-medium text-zinc-950 transition hover:bg-zinc-200'
                  : 'rounded-xl border border-zinc-700 px-6 py-3 text-center font-medium text-zinc-100 transition hover:border-zinc-500'
              }
            >
              {downloads[p].label}
              <span className="block text-xs font-normal opacity-60">{downloads[p].note}</span>
            </a>
          )
        })}
      </div>
      <a href={releasesUrl} className="text-sm text-zinc-500 underline-offset-4 hover:underline">
        All releases &amp; changelog
      </a>
    </div>
  )
}
