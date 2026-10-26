import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  canEncodeAudio,
  canEncodeVideo,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  type StreamTargetChunk,
} from 'mediabunny'
import { mixAudio, type MusicMix } from './audio'
import { computeLayout, renderComposite, type Composition } from './composition'
import { VIDEO_FRAMES, VIDEO_LIMITS } from './presets'
import { clamp } from './utils'

export interface VideoInfo {
  width: number
  height: number
  duration: number
  fps: number
  hasAudio: boolean
}

export async function probeVideo(file: Blob): Promise<VideoInfo> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    if (!(await input.canRead()))
      throw new Error('Xssential can’t read this file. Try an MP4, MOV or WebM video.')
    const video = await input.getPrimaryVideoTrack()
    if (!video) throw new Error('This file has no video in it.')
    if (!(await video.canDecode())) {
      throw new Error(
        'This video uses a codec Xssential can’t decode. Try converting it to H.264 MP4.',
      )
    }
    const [width, height, duration, audio] = await Promise.all([
      video.getDisplayWidth(),
      video.getDisplayHeight(),
      input.computeDuration(),
      input.getPrimaryAudioTrack(),
    ])
    const metrics = await video.computeFrameRateMetrics().catch(() => null)
    return {
      width,
      height,
      duration,
      fps: clamp(Math.round(metrics?.bestGuessFrameRate ?? 30), 1, 60),
      hasAudio: !!audio && (await audio.canDecode()),
    }
  } finally {
    input.dispose()
  }
}

// X recommends at least 5 Mbps; screen content stays crisp around 0.15 bits per pixel
export function videoBitrate(width: number, height: number, fps: number): number {
  return clamp(width * height * fps * 0.15, 5_000_000, 24_000_000)
}

export interface ExportJob {
  file: Blob
  info: VideoInfo
  comp: Composition
  start: number
  end: number
  fps: number
  backgroundImage: CanvasImageSource | null
  music: MusicMix | null
  keepOriginalAudio: boolean
  originalVolume: number
}

export function exportLayout(job: Pick<ExportJob, 'comp' | 'info'>) {
  return computeLayout(job.comp, job.info.width, job.info.height, VIDEO_FRAMES, VIDEO_LIMITS)
}

// Renders every frame through the compositor and encodes an MP4 with H.264 High profile
// video and AAC-LC audio, the formats X asks for. Data is streamed to `writable`.
export async function exportVideo(
  job: ExportJob,
  writable: WritableStream<StreamTargetChunk>,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const layout = exportLayout(job)
  const duration = Math.max(0.5, job.end - job.start)
  const quality = new Quality({ bitrate: videoBitrate(layout.width, layout.height, job.fps) })

  if (!(await canEncodeVideo('avc', { width: layout.width, height: layout.height, quality }))) {
    throw new Error(`This computer can't encode H.264 video at ${layout.width} × ${layout.height}.`)
  }

  const original = job.keepOriginalAudio && job.info.hasAudio
  if (
    (job.music || original) &&
    !(await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000 }))
  ) {
    throw new Error(
      "This computer can't encode AAC audio. Remove the music to export a silent video.",
    )
  }

  const soundtrack = await mixAudio({
    duration,
    music: job.music,
    original: original
      ? { file: job.file, start: job.start, end: job.end, volume: job.originalVolume }
      : null,
  })
  if (signal.aborted) throw new DOMException('Export canceled', 'AbortError')

  const input = new Input({ source: new BlobSource(job.file), formats: ALL_FORMATS })
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: false }),
    target: new StreamTarget(writable, { chunked: true }),
  })
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track) throw new Error('This file has no video in it.')

    const canvas = new OffscreenCanvas(layout.width, layout.height)
    const ctx = canvas.getContext('2d')!
    const videoSource = new CanvasSource(canvas, { codec: 'avc', quality, keyFrameInterval: 2 })
    output.addVideoTrack(videoSource, { frameRate: job.fps })

    let audioSource: AudioBufferSource | null = null
    if (soundtrack) {
      audioSource = new AudioBufferSource({
        codec: 'aac',
        quality: new Quality({ bitrate: 192_000 }),
      })
      output.addAudioTrack(audioSource)
    }

    await output.start()
    if (audioSource && soundtrack) {
      await audioSource.add(soundtrack)
      audioSource.close()
    }

    // Sample the source on a constant frame grid, which also evens out screen recordings
    // that only produce frames when something on screen changes
    const total = Math.max(1, Math.round(duration * job.fps))
    const times = function* () {
      for (let i = 0; i < total; i++) yield job.start + i / job.fps
    }
    const sink = new CanvasSink(track, { poolSize: 3 })
    let previous: HTMLCanvasElement | OffscreenCanvas | null = null
    let i = 0
    for await (const wrapped of sink.canvasesAtTimestamps(times())) {
      if (signal.aborted) throw new DOMException('Export canceled', 'AbortError')
      const frame = wrapped?.canvas ?? previous
      if (frame) {
        renderComposite(ctx, frame, layout, job.comp, {
          time: job.start + i / job.fps,
          backgroundImage: job.backgroundImage,
          opaque: '#000000',
        })
        previous = frame
      } else {
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, layout.width, layout.height)
      }
      await videoSource.add(i / job.fps, 1 / job.fps)
      i++
      onProgress(i / total)
    }
    videoSource.close()
    await output.finalize()
  } catch (err) {
    if (output.state !== 'finalized') await output.cancel().catch(() => {})
    throw err
  } finally {
    input.dispose()
  }
}

// A WritableStream that streams an export to a file the main process opened. `onWrite`
// receives the end offset of each write, which gives the final file size.
export function fileWritable(
  id: number,
  onWrite?: (end: number) => void,
): WritableStream<StreamTargetChunk> {
  return new WritableStream<StreamTargetChunk>({
    write: (chunk) => {
      const { data } = chunk
      // Send only this chunk's bytes, not the whole buffer behind the view
      const bytes =
        data.byteOffset === 0 && data.byteLength === data.buffer.byteLength ? data : data.slice()
      onWrite?.(chunk.position + bytes.byteLength)
      return window.api.files.write(id, chunk.position, bytes)
    },
    close: () => window.api.files.close(id),
  })
}
