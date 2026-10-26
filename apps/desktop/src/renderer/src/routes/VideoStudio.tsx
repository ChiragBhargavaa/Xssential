import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleDot, Clapperboard, FolderOpen, Loader2, Square } from 'lucide-react'
import { DropOverlay, EmptyState, useFileDrop } from '../components/EmptyState'
import { Button, Kbd, TitleBar } from '../components/ui'
import { SourcePicker, type RecordOptions } from '../components/video/SourcePicker'
import { VideoEditor, type Clip } from '../components/video/VideoEditor'
import type { RouteProps } from '../main'
import { startRecording, type RecordingSession } from '../lib/recording'
import { acceleratorKeys } from '../lib/shortcut'
import { toast } from '../lib/toast'
import { errorMessage, isMac, timestampName } from '../lib/utils'
import { probeVideo } from '../lib/video'

type Stage = 'start' | 'pick' | 'countdown' | 'recording' | 'processing' | 'edit'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const isVideoFile = (f: File) =>
  f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name)

export default function VideoStudio({ params }: RouteProps) {
  const [stage, setStage] = useState<Stage>(params.get('mode') === 'record' ? 'pick' : 'start')
  const [clip, setClip] = useState<Clip | null>(null)
  const [count, setCount] = useState(3)
  const [shortcut, setShortcut] = useState('')
  const session = useRef<RecordingSession | null>(null)
  const stopping = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.settings.get().then((s) => setShortcut(s.shortcut))
  }, [])

  const openClip = useCallback(
    async (file: Blob, name: string) => {
      setStage('processing')
      try {
        const info = await probeVideo(file)
        setClip({ file, name, info })
        setStage('edit')
      } catch (err) {
        toast(errorMessage(err), { tone: 'error' })
        setStage((s) => (s === 'processing' ? (clip ? 'edit' : 'start') : s))
      }
    },
    [clip],
  )

  const finishRecording = useCallback(async () => {
    const current = session.current
    if (!current || stopping.current) return
    stopping.current = true
    setStage('processing')
    window.api.recorder.stopped()
    try {
      const file = await current.stop()
      window.api.recorder.setWindowVisible(true)
      await openClip(file, timestampName('Recording', 'mp4'))
    } catch (err) {
      window.api.recorder.setWindowVisible(true)
      toast(`The recording could not be saved: ${errorMessage(err)}`, { tone: 'error' })
      setStage('pick')
    } finally {
      session.current = null
      stopping.current = false
    }
  }, [openClip])

  // The tray icon and the global shortcut ask us to stop
  useEffect(
    () => window.api.recorder.onStopRequest(() => void finishRecording()),
    [finishRecording],
  )

  const record = async (options: RecordOptions) => {
    if (options.countdown) {
      setStage('countdown')
      for (let n = 3; n > 0; n--) {
        setCount(n)
        await sleep(1000)
      }
    }
    window.api.recorder.setWindowVisible(false)
    // Let the window fade out so it isn't in the first frames
    await sleep(400)
    try {
      const s = await startRecording(options.sourceId, options.fps)
      session.current = s
      window.api.recorder.started()
      setStage('recording')
      void s.ended.then(() => finishRecording())
      s.failed.catch((err) => {
        if (session.current !== s) return
        session.current = null
        window.api.recorder.stopped()
        window.api.recorder.setWindowVisible(true)
        void s.cancel()
        toast(`Recording stopped: ${errorMessage(err)}`, { tone: 'error' })
        setStage('pick')
      })
    } catch (err) {
      window.api.recorder.setWindowVisible(true)
      toast(`Could not start recording: ${errorMessage(err)}`, { tone: 'error' })
      setStage('pick')
    }
  }

  // Closing the window mid-recording discards the recording
  useEffect(
    () => () => {
      void session.current?.cancel()
    },
    [],
  )

  const confirmDiscard = () =>
    !clip || window.confirm('Discard the current video? Unsaved edits will be lost.')

  const pickFile = () => fileInput.current?.click()

  const dragging = useFileDrop(isVideoFile, (f) => {
    if (stage === 'recording' || stage === 'countdown') return
    if (confirmDiscard()) void openClip(f, f.name)
  })

  const input = (
    <input
      ref={fileInput}
      type="file"
      accept="video/*,.mov,.mkv"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file && confirmDiscard()) void openClip(file, file.name)
      }}
    />
  )

  if (stage === 'edit' && clip) {
    return (
      <>
        <VideoEditor
          key={clip.name + clip.info.duration}
          clip={clip}
          onNewRecording={() => {
            if (confirmDiscard()) setStage('pick')
          }}
          onOpenVideo={pickFile}
        />
        {input}
        <DropOverlay show={dragging} label="Drop to open the video" />
      </>
    )
  }

  const stopKeys = shortcut ? acceleratorKeys(shortcut) : []

  return (
    <div className="flex h-full flex-col">
      <TitleBar>
        <span className="text-[13px] font-medium text-neutral-400">
          {stage === 'pick' ? 'Record screen' : 'Video'}
        </span>
        <div className="flex-1" />
        {stage === 'pick' && (
          <Button size="sm" variant="ghost" icon={FolderOpen} onClick={pickFile}>
            Open a video instead
          </Button>
        )}
      </TitleBar>

      {stage === 'start' && (
        <EmptyState
          icon={Clapperboard}
          title="Record your screen or bring your own video"
          description="Trim it, crop it, blur private details, drop the original sound and add free background music. Exports an MP4 that X accepts."
        >
          <Button variant="primary" icon={CircleDot} onClick={() => setStage('pick')}>
            Record screen
          </Button>
          <Button icon={FolderOpen} onClick={pickFile}>
            Open video
          </Button>
        </EmptyState>
      )}

      {stage === 'pick' && <SourcePicker onStart={(o) => void record(o)} />}

      {stage === 'countdown' && (
        <div className="flex flex-1 flex-col items-center justify-center">
          <div key={count} className="countdown text-[120px] leading-none font-bold text-white">
            {count}
          </div>
          <p className="mt-6 text-sm text-neutral-400">Recording starts when this window hides</p>
        </div>
      )}

      {stage === 'recording' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <div className="flex items-center gap-2 text-sm font-bold text-x-red">
            <span className="size-2.5 animate-pulse rounded-full bg-x-red" /> Recording
          </div>
          <p className="max-w-sm text-sm text-neutral-400">
            Stop with{' '}
            {stopKeys.map((k, i) => (
              <Kbd key={i}>{k}</Kbd>
            ))}{' '}
            or by clicking the red dot in the {isMac ? 'menu bar' : 'notification area'}.
          </p>
          <Button variant="primary" icon={Square} onClick={() => void finishRecording()}>
            Stop recording
          </Button>
        </div>
      )}

      {stage === 'processing' && (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-neutral-400">
          <Loader2 className="size-4 animate-spin" /> Preparing your video…
        </div>
      )}

      {input}
      <DropOverlay show={dragging} label="Drop to open the video" />
    </div>
  )
}
