import { app, ipcMain, net } from 'electron'
import type { MusicTrack } from '../shared/tools'

// Openverse (https://openverse.org) indexes openly licensed audio. Only licenses that allow
// using a track as background music in any post are searched: CC0, public domain and CC BY
// (which needs a credit line). Share-alike and non-commercial licenses are left out.
const API = 'https://api.openverse.org/v1/audio/'
const LICENSES = 'cc0,pdm,by'
const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024

const userAgent = () =>
  `Xssential/${app.getVersion()} (+https://github.com/ChiragBhargavaa/Xssential)`

interface OpenverseAudio {
  id: string
  title: string | null
  creator: string | null
  url: string | null
  duration: number | null
  license: string
  license_version: string | null
  license_url: string | null
  foreign_landing_url: string | null
  attribution: string | null
  source: string
}

function toTrack(r: OpenverseAudio): MusicTrack | null {
  if (!r.url) return null
  return {
    id: r.id,
    title: r.title?.trim() || 'Untitled',
    creator: r.creator?.trim() || 'Unknown artist',
    url: r.url,
    duration: r.duration ? r.duration / 1000 : null,
    license: r.license,
    licenseVersion: r.license_version ?? '',
    licenseUrl: r.license_url ?? '',
    landingUrl: r.foreign_landing_url ?? '',
    attribution: r.attribution ?? '',
    source: r.source,
  }
}

export function registerMusicIpc(): void {
  ipcMain.handle('music:search', async (_e, args: { query: string; page: number }) => {
    const url = new URL(API)
    url.searchParams.set('q', args.query.trim() || 'instrumental')
    url.searchParams.set('license', LICENSES)
    url.searchParams.set('category', 'music')
    url.searchParams.set('page_size', '20')
    url.searchParams.set('page', String(Math.max(1, Math.floor(args.page))))
    const res = await net.fetch(url.toString(), {
      headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
    })
    if (res.status === 429) {
      throw new Error('The free music library is busy. Wait a minute and try again.')
    }
    if (!res.ok) throw new Error(`The music library returned an error (${res.status}).`)
    const body = (await res.json()) as { results: OpenverseAudio[]; page_count: number }
    return {
      tracks: body.results.map(toTrack).filter((t): t is MusicTrack => t !== null),
      pageCount: body.page_count,
    }
  })

  // Downloads go through the main process so the renderer keeps a strict content policy
  ipcMain.handle('music:download', async (_e, url: string) => {
    if (new URL(url).protocol !== 'https:') throw new Error('Only HTTPS downloads are allowed')
    const res = await net.fetch(url, { headers: { 'User-Agent': userAgent() } })
    if (!res.ok) throw new Error(`Could not download the track (${res.status}).`)
    const length = Number(res.headers.get('content-length') ?? 0)
    if (length > MAX_DOWNLOAD_BYTES) throw new Error('This track is too large to use.')
    const data = new Uint8Array(await res.arrayBuffer())
    if (data.byteLength > MAX_DOWNLOAD_BYTES) throw new Error('This track is too large to use.')
    return data
  })
}
