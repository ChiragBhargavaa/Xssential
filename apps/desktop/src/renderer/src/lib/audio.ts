import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny'

export const SAMPLE_RATE = 48000

export async function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  // decodeAudioData resamples to the context's rate
  return new OfflineAudioContext(2, 1, SAMPLE_RATE).decodeAudioData(data)
}

export interface MusicMix {
  buffer: AudioBuffer
  volume: number
  // Where in the track to start, in seconds
  offset: number
  fade: boolean
}

export interface OriginalMix {
  file: Blob
  start: number
  end: number
  volume: number
}

// Renders the final soundtrack: background music (looped to cover the clip) mixed with the
// clip's own audio if it is kept. Returns null when the video should be silent.
export async function mixAudio(opts: {
  duration: number
  music: MusicMix | null
  original: OriginalMix | null
}): Promise<AudioBuffer | null> {
  const { duration, music, original } = opts
  if (!music && !original) return null
  const ctx = new OfflineAudioContext(
    2,
    Math.max(1, Math.ceil(duration * SAMPLE_RATE)),
    SAMPLE_RATE,
  )

  if (music) {
    const source = ctx.createBufferSource()
    source.buffer = music.buffer
    source.loop = true
    const offset = Math.min(music.offset, Math.max(0, music.buffer.duration - 1))
    source.loopStart = offset
    source.loopEnd = music.buffer.duration
    const gain = ctx.createGain()
    if (music.fade) {
      const fadeIn = Math.min(1, duration / 4)
      const fadeOut = Math.min(2.5, duration / 4)
      gain.gain.setValueAtTime(0, 0)
      gain.gain.linearRampToValueAtTime(music.volume, fadeIn)
      gain.gain.setValueAtTime(music.volume, Math.max(fadeIn, duration - fadeOut))
      gain.gain.linearRampToValueAtTime(0, duration)
    } else {
      gain.gain.value = music.volume
    }
    source.connect(gain).connect(ctx.destination)
    source.start(0, offset)
  }

  if (original) {
    const input = new Input({ source: new BlobSource(original.file), formats: ALL_FORMATS })
    try {
      const track = await input.getPrimaryAudioTrack()
      if (track && (await track.canDecode())) {
        const gain = ctx.createGain()
        gain.gain.value = original.volume
        gain.connect(ctx.destination)
        const sink = new AudioBufferSink(track)
        for await (const { buffer, timestamp } of sink.buffers(original.start, original.end)) {
          const node = ctx.createBufferSource()
          node.buffer = buffer
          node.connect(gain)
          const when = timestamp - original.start
          if (when >= 0) node.start(when)
          else node.start(0, -when)
        }
      }
    } finally {
      input.dispose()
    }
  }

  return ctx.startRendering()
}
