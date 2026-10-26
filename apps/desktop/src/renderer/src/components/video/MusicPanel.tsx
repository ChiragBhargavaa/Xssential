import { useEffect, useRef, useState } from 'react'
import {
  Copy,
  ExternalLink,
  FolderOpen,
  Loader2,
  Music,
  Pause,
  Play,
  Search,
  X,
} from 'lucide-react'
import type { MusicTrack } from '../../../../shared/tools'
import { decodeAudio } from '../../lib/audio'
import { toast } from '../../lib/toast'
import { cx, errorMessage, formatTime } from '../../lib/utils'
import { Button, Segmented, Slider, Toggle } from '../ui'

export interface LoadedMusic {
  title: string
  creator: string | null
  license: string | null
  // Credit line to put in the post, when the license asks for one
  credit: string | null
  landingUrl: string | null
  // Object URL for previews
  url: string
  buffer: AudioBuffer
}

export interface MusicSettings {
  volume: number
  offset: number
  fade: boolean
}

const MOODS = [
  'Lo-fi',
  'Chill',
  'Ambient',
  'Upbeat',
  'Piano',
  'Cinematic',
  'Acoustic',
  'Electronic',
  'Corporate',
]

function licenseLabel(t: MusicTrack) {
  if (t.license === 'cc0') return 'CC0'
  if (t.license === 'pdm') return 'Public domain'
  return `CC ${t.license.toUpperCase()} ${t.licenseVersion}`.trim()
}

function TrackRow({
  track,
  previewing,
  loading,
  onPreview,
  onUse,
}: {
  track: MusicTrack
  previewing: boolean
  loading: boolean
  onPreview: () => void
  onUse: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-neutral-50">
      <button
        type="button"
        aria-label={previewing ? 'Stop preview' : 'Preview'}
        onClick={onPreview}
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-900 hover:bg-neutral-200"
      >
        {previewing ? <Pause className="size-3" /> : <Play className="ml-0.5 size-3" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-neutral-900">{track.title}</div>
        <div className="truncate text-[11px] text-neutral-600">
          {track.creator}
          {track.duration ? ` · ${formatTime(track.duration)}` : ''} · {licenseLabel(track)}
        </div>
      </div>
      <Button size="sm" variant="ghost" loading={loading} onClick={onUse}>
        Use
      </Button>
    </div>
  )
}

export function MusicPanel({
  music,
  onMusic,
  settings,
  onSettings,
}: {
  music: LoadedMusic | null
  onMusic: (music: LoadedMusic | null) => void
  settings: MusicSettings
  onSettings: (settings: MusicSettings) => void
}) {
  const [tab, setTab] = useState<'library' | 'file'>('library')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MusicTrack[] | null>(null)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const preview = useRef<HTMLAudioElement | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const stopPreview = () => {
    preview.current?.pause()
    preview.current = null
    setPreviewId(null)
  }
  useEffect(() => stopPreview, [])

  const search = async (q: string, p = 1) => {
    setQuery(q)
    setSearching(true)
    setError(null)
    try {
      const res = await window.api.music.search(q, p)
      setResults((prev) => (p > 1 && prev ? [...prev, ...res.tracks] : res.tracks))
      setPage(p)
      setPageCount(res.pageCount)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSearching(false)
    }
  }

  const togglePreview = (track: MusicTrack) => {
    if (previewId === track.id) {
      stopPreview()
      return
    }
    stopPreview()
    const audio = new Audio(track.url)
    audio.volume = 0.8
    audio.onended = () => setPreviewId(null)
    audio.play().catch(() => {
      toast('Could not play this preview.', { tone: 'error' })
      setPreviewId(null)
    })
    preview.current = audio
    setPreviewId(track.id)
  }

  const pickTrack = async (track: MusicTrack) => {
    setLoadingId(track.id)
    try {
      const data = await window.api.music.download(track.url)
      const bytes = data.slice().buffer as ArrayBuffer
      const buffer = await decodeAudio(bytes.slice(0))
      stopPreview()
      onMusic({
        title: track.title,
        creator: track.creator,
        license: licenseLabel(track),
        credit:
          track.license === 'by'
            ? track.attribution || `“${track.title}” by ${track.creator} (${licenseLabel(track)})`
            : null,
        landingUrl: track.landingUrl || null,
        url: URL.createObjectURL(new Blob([bytes])),
        buffer,
      })
      onSettings({ ...settings, offset: 0 })
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' })
    } finally {
      setLoadingId(null)
    }
  }

  const pickFile = async (file: File) => {
    try {
      const buffer = await decodeAudio(await file.arrayBuffer())
      onMusic({
        title: file.name.replace(/\.[^.]+$/, ''),
        creator: null,
        license: null,
        credit: null,
        landingUrl: null,
        url: URL.createObjectURL(file),
        buffer,
      })
      onSettings({ ...settings, offset: 0 })
    } catch {
      toast('Xssential can’t read that audio file. Try an MP3, M4A or WAV.', { tone: 'error' })
    }
  }

  if (music) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-neutral-50 p-3 ring-1 ring-neutral-200">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-x-blue">
            <Music className="size-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] text-neutral-900">{music.title}</div>
            <div className="truncate text-xs text-neutral-600">
              {[music.creator, music.license, formatTime(music.buffer.duration)]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <button
            type="button"
            aria-label="Remove music"
            onClick={() => onMusic(null)}
            className="text-neutral-600 hover:text-neutral-900"
          >
            <X className="size-4" />
          </button>
        </div>

        <Slider
          label="Music volume"
          value={Math.round(settings.volume * 100)}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => onSettings({ ...settings, volume: v / 100 })}
        />
        <Slider
          label="Start the track at"
          value={Math.round(settings.offset)}
          min={0}
          max={Math.max(0, Math.floor(music.buffer.duration - 1))}
          unit=" s"
          onChange={(v) => onSettings({ ...settings, offset: v })}
        />
        <Toggle
          label="Fade in and out"
          checked={settings.fade}
          onChange={(fade) => onSettings({ ...settings, fade })}
        />

        {music.credit && (
          <div className="rounded-xl bg-x-yellow/10 p-3 text-[13px] leading-relaxed text-neutral-900 ring-1 ring-x-yellow/25">
            <p className="font-bold text-x-yellow">Credit the artist in your post</p>
            <p className="mt-1 text-neutral-600">{music.credit}</p>
            <div className="mt-2 flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                icon={Copy}
                onClick={() => {
                  void navigator.clipboard.writeText(music.credit!)
                  toast('Credit copied', { tone: 'success' })
                }}
              >
                Copy credit
              </Button>
              {music.landingUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={ExternalLink}
                  onClick={() => window.open(music.landingUrl!, '_blank')}
                >
                  Track page
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Segmented
        value={tab}
        onChange={(t) => {
          stopPreview()
          setTab(t)
        }}
        options={[
          { value: 'library', label: 'Free music' },
          { value: 'file', label: 'My file' },
        ]}
      />

      {tab === 'file' ? (
        <div>
          <Button icon={FolderOpen} className="w-full" onClick={() => fileInput.current?.click()}>
            Choose an audio file
          </Button>
          <p className="mt-2 text-xs leading-relaxed text-neutral-600">
            MP3, M4A, WAV or OGG. Make sure you have the rights to use it.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void pickFile(file)
              e.target.value = ''
            }}
          />
        </div>
      ) : (
        <div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void search(query)
            }}
            className="flex items-center gap-2 rounded-full bg-neutral-100 px-3.5 ring-1 ring-neutral-100 focus-within:bg-white focus-within:ring-x-blue"
          >
            <Search className="size-3.5 text-neutral-600" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search free music"
              className="h-8 min-w-0 flex-1 bg-transparent text-xs text-neutral-900 outline-none placeholder:text-neutral-600"
            />
            {searching && <Loader2 className="size-3.5 animate-spin text-neutral-600" />}
          </form>
          <div className="mt-2 flex flex-wrap gap-1">
            {MOODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => void search(m)}
                className={cx(
                  'rounded-full px-2 py-0.5 text-[11px] ring-1 transition-colors',
                  query === m
                    ? 'bg-neutral-900 font-bold text-white ring-neutral-900'
                    : 'text-neutral-600 ring-neutral-300 hover:text-neutral-900',
                )}
              >
                {m}
              </button>
            ))}
          </div>

          {error && <p className="mt-3 text-xs text-x-red">{error}</p>}
          {results && results.length === 0 && !searching && (
            <p className="mt-3 text-xs text-neutral-600">Nothing found. Try another word.</p>
          )}
          {results && results.length > 0 && (
            <div className="mt-2 -mx-1.5 max-h-72 overflow-y-auto">
              {results.map((t) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  previewing={previewId === t.id}
                  loading={loadingId === t.id}
                  onPreview={() => togglePreview(t)}
                  onUse={() => void pickTrack(t)}
                />
              ))}
              {page < pageCount && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1 w-full"
                  loading={searching}
                  onClick={() => void search(query, page + 1)}
                >
                  More results
                </Button>
              )}
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-neutral-600">
            Openly licensed music from{' '}
            <a
              href="https://openverse.org"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-neutral-600"
            >
              Openverse
            </a>
            . Only CC0, public domain and CC BY tracks are shown, so they can be used in any post.
            CC BY tracks need a credit line.
          </p>
        </div>
      )}
    </div>
  )
}
