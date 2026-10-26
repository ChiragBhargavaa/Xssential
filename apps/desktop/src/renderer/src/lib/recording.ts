import {
  MediaStreamVideoTrackSource,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
} from 'mediabunny'
import { clamp } from './utils'

// Recordings are capped at 4K so every H.264 encoder can handle them; exports are smaller still
const MAX_WIDTH = 3840
const MAX_HEIGHT = 2160
// Recordings older than this are cleared from app storage when a new one starts
const KEEP_MS = 12 * 60 * 60 * 1000

export interface RecordingSession {
  // Resolves when capture ends on its own (the window closed, or the system stopped it)
  ended: Promise<void>
  // Resolves if the encoder fails
  failed: Promise<unknown>
  stop: () => Promise<File>
  cancel: () => Promise<void>
}

const even = (v: number) => Math.max(2, Math.round(v / 2) * 2)

async function clearOldRecordings(root: FileSystemDirectoryHandle) {
  const now = Date.now()
  for await (const [name, handle] of root.entries()) {
    if (!name.startsWith('recording-') || handle.kind !== 'file') continue
    try {
      const file = await handle.getFile()
      if (now - file.lastModified > KEEP_MS) await root.removeEntry(name)
    } catch {
      // In use or already gone
    }
  }
}

// Records the chosen screen or window to an MP4 in the app's private storage. Frames are
// encoded as they arrive, so nothing large is held in memory.
export async function startRecording(sourceId: string, fps: 30 | 60): Promise<RecordingSession> {
  await window.api.recorder.select(sourceId)
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: fps, max: fps } },
    audio: false,
  })
  const track = stream.getVideoTracks()[0]
  if (!track) throw new Error('Could not capture the screen.')

  const settings = track.getSettings()
  const width = settings.width ?? 1920
  const height = settings.height ?? 1080
  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height)
  const outW = even(width * scale)
  const outH = even(height * scale)

  const root = await navigator.storage.getDirectory()
  await clearOldRecordings(root).catch(() => {})
  const name = `recording-${Date.now()}.mp4`
  const handle = await root.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: false }),
    target: new StreamTarget(writable, { chunked: true }),
  })
  const source = new MediaStreamVideoTrackSource(
    track,
    {
      codec: 'avc',
      quality: new Quality({ bitrate: clamp(outW * outH * fps * 0.12, 8_000_000, 40_000_000) }),
      latencyMode: 'realtime',
      // Windows can be resized while recording; keep every frame in the first frame's box
      sizeChangeBehavior: 'contain',
      transform: { width: outW, height: outH },
    },
    { frameRate: fps },
  )
  output.addVideoTrack(source, { frameRate: fps })
  await output.start()

  const ended = new Promise<void>((resolve) => track.addEventListener('ended', () => resolve()))
  let finished = false

  return {
    ended,
    failed: source.errorPromise,
    stop: async () => {
      if (finished) throw new Error('This recording already ended.')
      finished = true
      track.stop()
      await output.finalize()
      return handle.getFile()
    },
    cancel: async () => {
      if (finished) return
      finished = true
      track.stop()
      await output.cancel().catch(() => {})
      await writable.close().catch(() => {})
      await root.removeEntry(name).catch(() => {})
    },
  }
}
