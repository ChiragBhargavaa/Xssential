import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny'
import {
  CircleDot,
  Crop,
  Droplets,
  FileVideo,
  MousePointer2,
  Redo2,
  Undo2,
  Upload,
} from 'lucide-react'
import { handleEditorKey, loadStyle, saveStyle } from '../../lib/editor'
import type { Composition } from '../../lib/composition'
import { useBitmap, useHistory, useKeydown, type HistoryMode } from '../../lib/hooks'
import { VIDEO_FRAMES, VIDEO_LIMITS } from '../../lib/presets'
import { savedToast, toast } from '../../lib/toast'
import { clamp, errorMessage, formatBytes, modKey } from '../../lib/utils'
import { exportLayout, exportVideo, fileWritable, type VideoInfo } from '../../lib/video'
import { RedactionSection, StyleSections, type RedactionDefaults } from '../Inspector'
import { Stage, type StageHandle, type StageMode } from '../Stage'
import {
  Button,
  IconButton,
  ProgressBar,
  Section,
  Segmented,
  Slider,
  TitleBar,
  Toggle,
  ToolbarDivider,
} from '../ui'
import { MusicPanel, type LoadedMusic, type MusicSettings } from './MusicPanel'
import { Timeline } from './Timeline'

const STYLE_KEY = 'xssential.video-style.v2'

export interface Clip {
  file: Blob
  name: string
  info: VideoInfo
}

interface VideoDoc {
  comp: Composition
  start: number
  end: number
}

function canvasUrl(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string> {
  if (canvas instanceof HTMLCanvasElement)
    return Promise.resolve(canvas.toDataURL('image/jpeg', 0.7))
  return canvas
    .convertToBlob({ type: 'image/jpeg', quality: 0.7 })
    .then((b) => URL.createObjectURL(b))
}

function useThumbnails(file: Blob, duration: number, count = 14) {
  const [thumbs, setThumbs] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
    ;(async () => {
      const track = await input.getPrimaryVideoTrack()
      if (!track) return
      const sink = new CanvasSink(track, { height: 72 })
      const times = Array.from({ length: count }, (_, i) => ((i + 0.5) * duration) / count)
      const urls: string[] = []
      for await (const wrapped of sink.canvasesAtTimestamps(times)) {
        if (cancelled) return
        if (wrapped) urls.push(await canvasUrl(wrapped.canvas))
      }
      if (!cancelled) setThumbs(urls)
    })()
      .catch(() => {})
      .finally(() => input.dispose())
    return () => {
      cancelled = true
    }
  }, [file, duration, count])
  return thumbs
}

export function VideoEditor({
  clip,
  onNewRecording,
  onOpenVideo,
}: {
  clip: Clip
  onNewRecording: () => void
  onOpenVideo: () => void
}) {
  const { info } = clip
  const history = useHistory<VideoDoc>(() => ({
    comp: loadStyle(STYLE_KEY, VIDEO_FRAMES),
    start: 0,
    end: info.duration,
  }))
  const { update } = history
  const doc = history.value
  const updateComp = useCallback(
    (fn: (c: Composition) => Composition, mode?: HistoryMode) =>
      update((d) => ({ ...d, comp: fn(d.comp) }), mode),
    [update],
  )
  useEffect(() => saveStyle(STYLE_KEY, doc.comp), [doc.comp])

  const [mode, setMode] = useState<StageMode>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [defaults, setDefaults] = useState<RedactionDefaults>({ strength: 60 })

  const videoRef = useRef<HTMLVideoElement>(null)
  const musicRef = useRef<HTMLAudioElement>(null)
  const stageRef = useRef<StageHandle>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)

  const [keepOriginal, setKeepOriginal] = useState(false)
  const [originalVolume, setOriginalVolume] = useState(1)
  const [music, setMusic] = useState<LoadedMusic | null>(null)
  const [musicSettings, setMusicSettings] = useState<MusicSettings>({
    volume: 0.7,
    offset: 0,
    fade: true,
  })
  const [fps, setFps] = useState<'30' | '60'>(info.fps >= 50 ? '60' : '30')
  const [exporting, setExporting] = useState<{
    progress: number
    controller: AbortController
  } | null>(null)

  const url = useMemo(() => URL.createObjectURL(clip.file), [clip.file])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  useEffect(
    () => () => {
      if (music) URL.revokeObjectURL(music.url)
    },
    [music],
  )

  const backgroundImage = useBitmap(
    doc.comp.background.kind === 'image' ? doc.comp.background.url : null,
  )
  const thumbnails = useThumbnails(clip.file, info.duration)
  const layout = exportLayout({ comp: doc.comp, info })

  // Where the music should be for a given video time (it loops from the chosen start)
  const musicTime = useCallback(
    (t: number) => {
      if (!music) return 0
      const length = Math.max(0.1, music.buffer.duration - musicSettings.offset)
      return musicSettings.offset + ((((t - doc.start) % length) + length) % length)
    },
    [music, musicSettings.offset, doc.start],
  )

  const video = videoRef.current
  useEffect(() => {
    if (!video) return
    video.muted = !keepOriginal
    video.volume = originalVolume
  }, [video, keepOriginal, originalVolume, ready])

  useEffect(() => {
    if (musicRef.current) musicRef.current.volume = musicSettings.volume
  }, [musicSettings.volume, music])

  const seek = useCallback((t: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = t
    setTime(t)
  }, [])

  const playPause = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (!v.paused) {
      v.pause()
      return
    }
    if (v.currentTime < doc.start || v.currentTime >= doc.end - 0.05) v.currentTime = doc.start
    void v.play()
  }, [doc.start, doc.end])

  // While playing: redraw every frame, stop at the trim end and keep the music in sync
  useEffect(() => {
    if (!playing) {
      musicRef.current?.pause()
      return undefined
    }
    const v = videoRef.current!
    const m = musicRef.current
    if (m && music) {
      m.currentTime = musicTime(v.currentTime)
      void m.play().catch(() => {})
    }
    let raf = 0
    let lastState = 0
    const tick = (now: number) => {
      if (v.currentTime >= doc.end) {
        v.pause()
        v.currentTime = doc.end
      }
      stageRef.current?.draw()
      if (now - lastState > 90) {
        lastState = now
        setTime(v.currentTime)
        if (m && music && Math.abs(m.currentTime - musicTime(v.currentTime)) > 0.3) {
          m.currentTime = musicTime(v.currentTime)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, doc.end, music, musicTime])

  const setTrim = (start: number, end: number, m: HistoryMode) =>
    update((d) => ({ ...d, start, end }), m)

  const deleteSelected = () => {
    if (!selectedId) return
    updateComp((c) => ({ ...c, redactions: c.redactions.filter((r) => r.id !== selectedId) }))
    setSelectedId(null)
  }

  const exportMp4 = async () => {
    if (exporting) return
    videoRef.current?.pause()
    const base = clip.name.replace(/\.[^.]+$/, '') || 'Xssential video'
    const target = await window.api.files.openWrite({
      name: `${base}.mp4`,
      kind: 'video',
      filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
    })
    if (!target) return
    const controller = new AbortController()
    setExporting({ progress: 0, controller })
    let size = 0
    let percent = 0
    const writable = fileWritable(target.id, (end) => {
      size = Math.max(size, end)
    })
    try {
      await exportVideo(
        {
          file: clip.file,
          info,
          comp: doc.comp,
          start: doc.start,
          end: doc.end,
          fps: fps === '60' ? 60 : 30,
          backgroundImage,
          music: music ? { buffer: music.buffer, ...musicSettings } : null,
          keepOriginalAudio: keepOriginal,
          originalVolume,
        },
        writable,
        (progress) => {
          // Re-render only when the shown percentage changes
          const next = Math.floor(progress * 100)
          if (next === percent) return
          percent = next
          setExporting((e) => (e ? { ...e, progress } : e))
        },
        controller.signal,
      )
      savedToast(target.path, ` (${formatBytes(size)})`)
      if (music?.credit) toast('Remember to credit the music in your post.', { tone: 'info' })
    } catch (err) {
      await window.api.files.abort(target.id).catch(() => {})
      if (controller.signal.aborted) toast('Export canceled')
      else toast(errorMessage(err), { tone: 'error' })
    } finally {
      setExporting(null)
    }
  }

  useKeydown((e) => {
    if (exporting) return
    const mod = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()
    if (mod && (key === 's' || key === 'e')) {
      e.preventDefault()
      void exportMp4()
      return
    }
    if (
      handleEditorKey(e, {
        mode,
        setMode,
        undo: history.undo,
        redo: history.redo,
        deleteSelected,
        deselect: () => setSelectedId(null),
      })
    ) {
      e.preventDefault()
      return
    }
    if (mod || mode === 'crop' || (e.target as HTMLElement)?.tagName === 'INPUT') return
    const v = videoRef.current
    if (!v) return
    if (e.key === ' ') {
      e.preventDefault()
      playPause()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const step = e.shiftKey ? 1 : 1 / info.fps
      seek(clamp(v.currentTime + (e.key === 'ArrowLeft' ? -step : step), 0, info.duration))
    } else if (key === 'i') {
      setTrim(Math.min(v.currentTime, doc.end - 0.5), doc.end, 'push')
    } else if (key === 'o') {
      setTrim(doc.start, Math.max(v.currentTime, doc.start + 0.5), 'push')
    }
  })

  const tools: { mode: StageMode; icon: typeof Crop; label: string; key: string }[] = [
    { mode: 'select', icon: MousePointer2, label: 'Select', key: 'V' },
    { mode: 'crop', icon: Crop, label: 'Crop', key: 'C' },
    { mode: 'blur', icon: Droplets, label: 'Blur an area', key: 'B' },
  ]

  return (
    <div className="flex h-full flex-col">
      <TitleBar>
        {tools.map((t) => (
          <IconButton
            key={t.mode}
            icon={t.icon}
            label={t.label}
            shortcut={t.key}
            active={mode === t.mode}
            onClick={() => setMode(t.mode)}
          />
        ))}
        <ToolbarDivider />
        <IconButton
          icon={Undo2}
          label="Undo"
          shortcut={`${modKey}Z`}
          disabled={!history.canUndo}
          onClick={history.undo}
        />
        <IconButton
          icon={Redo2}
          label="Redo"
          shortcut={`${modKey}⇧Z`}
          disabled={!history.canRedo}
          onClick={history.redo}
        />
        <ToolbarDivider />
        <IconButton icon={CircleDot} label="New recording" onClick={onNewRecording} />
        <IconButton icon={FileVideo} label="Open another video" onClick={onOpenVideo} />
        <div className="flex-1" />
        <span className="mr-2 text-xs text-neutral-600 tabular-nums">
          {layout.width} × {layout.height} · {fps} fps · MP4
        </span>
        <Button variant="primary" icon={Upload} onClick={exportMp4} title={`Export (${modKey}S)`}>
          Export MP4
        </Button>
      </TitleBar>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col bg-neutral-50">
          <Stage
            handle={stageRef}
            source={ready ? videoRef.current : null}
            width={info.width}
            height={info.height}
            comp={doc.comp}
            frames={VIDEO_FRAMES}
            limits={VIDEO_LIMITS}
            mode={mode}
            onModeChange={setMode}
            update={updateComp}
            selectedId={selectedId}
            onSelect={setSelectedId}
            backgroundImage={backgroundImage}
            time={time}
            opaque="#000000"
            newRedaction={defaults}
          />
          <Timeline
            duration={info.duration}
            time={time}
            start={doc.start}
            end={doc.end}
            playing={playing}
            thumbnails={thumbnails}
            onPlayPause={playPause}
            onSeek={seek}
            onTrim={setTrim}
          />
        </div>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-neutral-100 bg-white">
          <StyleSections
            comp={doc.comp}
            update={updateComp}
            frames={VIDEO_FRAMES}
            autoSize={layout}
          />
          {/* Only shown while blurring, or with a blurred area selected */}
          {(mode === 'blur' || doc.comp.redactions.some((r) => r.id === selectedId)) && (
            <RedactionSection
              comp={doc.comp}
              update={updateComp}
              selectedId={selectedId}
              onSelect={setSelectedId}
              defaults={defaults}
              onDefaultsChange={setDefaults}
              video={{ duration: info.duration, time }}
            />
          )}
          <Section title="Original audio">
            <Toggle
              label="Keep the video's own sound"
              description={
                info.hasAudio
                  ? 'Off by default, so the exported video has no original audio at all.'
                  : 'This video has no sound.'
              }
              checked={keepOriginal && info.hasAudio}
              disabled={!info.hasAudio}
              onChange={setKeepOriginal}
            />
            {keepOriginal && info.hasAudio && (
              <div className="mt-4">
                <Slider
                  label="Volume"
                  value={Math.round(originalVolume * 100)}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => setOriginalVolume(v / 100)}
                />
              </div>
            )}
          </Section>
          <Section title="Background music">
            <MusicPanel
              music={music}
              onMusic={setMusic}
              settings={musicSettings}
              onSettings={setMusicSettings}
            />
          </Section>
          <Section title="Export">
            <div className="mb-1.5 text-xs text-neutral-800">Frame rate</div>
            <Segmented
              value={fps}
              onChange={setFps}
              options={[
                { value: '30', label: '30 fps' },
                { value: '60', label: '60 fps' },
              ]}
            />
            <p className="mt-2.5 text-xs leading-relaxed text-neutral-600">
              MP4 with H.264 video and AAC audio, the format X recommends. Up to 1080p.
            </p>
          </Section>
        </aside>
      </div>

      <video
        ref={videoRef}
        src={url}
        playsInline
        preload="auto"
        // Kept in the layout (but invisible) so the browser keeps decoding frames
        className="pointer-events-none fixed bottom-0 left-0 size-0.5 opacity-[0.01]"
        onLoadedData={() => {
          setReady(true)
          requestAnimationFrame(() => stageRef.current?.draw())
        }}
        onSeeked={() => {
          stageRef.current?.draw()
          setTime(videoRef.current?.currentTime ?? 0)
          if (playing && musicRef.current && music)
            musicRef.current.currentTime = musicTime(videoRef.current!.currentTime)
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false)
          setTime(videoRef.current?.currentTime ?? 0)
          stageRef.current?.draw()
        }}
        onError={() => toast('This video can’t be played for preview.', { tone: 'error' })}
      />
      {music && <audio ref={musicRef} src={music.url} loop preload="auto" />}

      {exporting && (
        <div className="fade-in fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-96 rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-extrabold">Exporting video</h3>
            <p className="mt-1 text-xs text-neutral-600">
              {layout.width} × {layout.height} · {fps} fps · {Math.round(exporting.progress * 100)}%
            </p>
            <div className="mt-4">
              <ProgressBar value={exporting.progress} />
            </div>
            <div className="mt-5 flex justify-end">
              <Button variant="ghost" onClick={() => exporting.controller.abort()}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
