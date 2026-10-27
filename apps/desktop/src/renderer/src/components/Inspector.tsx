import { Trash2 } from 'lucide-react'
import type { Composition, FramePreset, Redaction } from '../lib/composition'
import type { HistoryMode } from '../lib/hooks'
import { formatTime, isMac } from '../lib/utils'
import { BackgroundPicker, FramePicker } from './StylePickers'
import { Button, Section, Slider, Toggle } from './ui'

type Update = (fn: (c: Composition) => Composition, mode?: HistoryMode) => void

export function StyleSections({
  comp,
  update,
  frames,
  autoSize,
}: {
  comp: Composition
  update: Update
  frames: FramePreset[]
  autoSize: { width: number; height: number }
}) {
  return (
    <>
      <Section title="Size">
        <FramePicker
          frames={frames}
          value={comp.frame}
          autoSize={autoSize}
          onChange={(frame) => update((c) => ({ ...c, frame }))}
        />
      </Section>
      <Section title="Background">
        <BackgroundPicker
          value={comp.background}
          onChange={(background, mode) => update((c) => ({ ...c, background }), mode)}
        />
      </Section>
      <Section title="Style">
        <div className="space-y-4">
          <Slider
            label="Padding"
            value={comp.padding}
            min={0}
            max={256}
            unit=" px"
            onChange={(padding, mode) => update((c) => ({ ...c, padding }), mode)}
          />
          <Slider
            label="Rounded corners"
            value={comp.radius}
            min={0}
            max={120}
            unit=" px"
            onChange={(radius, mode) => update((c) => ({ ...c, radius }), mode)}
          />
          <Slider
            label="Shadow"
            value={comp.shadow}
            min={0}
            max={100}
            unit="%"
            onChange={(shadow, mode) => update((c) => ({ ...c, shadow }), mode)}
          />
        </div>
      </Section>
    </>
  )
}

export interface RedactionDefaults {
  strength: number
}

export function RedactionSection({
  comp,
  update,
  selectedId,
  onSelect,
  defaults,
  onDefaultsChange,
  video,
}: {
  comp: Composition
  update: Update
  selectedId: string | null
  onSelect: (id: string | null) => void
  defaults: RedactionDefaults
  onDefaultsChange: (d: RedactionDefaults) => void
  video?: { duration: number; time: number }
}) {
  const selected = comp.redactions.find((r) => r.id === selectedId) ?? null
  const target = selected ?? defaults

  const patchSelected = (patch: Partial<Redaction>, mode?: HistoryMode) => {
    if (!selected) return
    update(
      (c) => ({
        ...c,
        redactions: c.redactions.map((r) => (r.id === selected.id ? { ...r, ...patch } : r)),
      }),
      mode,
    )
  }

  const removeSelected = () => {
    if (!selected) return
    update((c) => ({ ...c, redactions: c.redactions.filter((r) => r.id !== selected.id) }))
    onSelect(null)
  }

  return (
    <Section
      title="Blur"
      action={
        comp.redactions.length > 0 && (
          <button
            type="button"
            className="text-xs text-neutral-600 hover:text-neutral-900"
            onClick={() => {
              update((c) => ({ ...c, redactions: [] }))
              onSelect(null)
            }}
          >
            Remove all ({comp.redactions.length})
          </button>
        )
      }
    >
      <p className="mb-3 text-xs leading-relaxed text-neutral-600">
        {selected ? 'Editing the selected area.' : 'Drag over anything private.'}
      </p>
      <div className="space-y-4">
        <Slider
          label="Strength"
          value={target.strength}
          min={10}
          max={100}
          onChange={(strength, mode) =>
            selected
              ? patchSelected({ strength }, mode)
              : onDefaultsChange({ ...defaults, strength })
          }
        />

        {selected && video && (
          <div className="space-y-2.5 rounded-lg bg-neutral-50 p-3 ring-1 ring-neutral-200">
            <Toggle
              label="Whole video"
              description="Turn off to hide this area only part of the time."
              checked={selected.start === undefined && selected.end === undefined}
              onChange={(whole) =>
                patchSelected(
                  whole
                    ? { start: undefined, end: undefined }
                    : { start: video.time, end: Math.min(video.duration, video.time + 3) },
                )
              }
            />
            {(selected.start !== undefined || selected.end !== undefined) && (
              <div className="space-y-1.5 text-xs">
                {(['start', 'end'] as const).map((edge) => (
                  <div key={edge} className="flex items-center justify-between gap-2">
                    <span className="text-neutral-600">
                      {edge === 'start' ? 'From' : 'Until'}{' '}
                      <span className="text-neutral-900 tabular-nums">
                        {formatTime(
                          selected[edge] ?? (edge === 'start' ? 0 : video.duration),
                          true,
                        )}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const t = video.time
                        if (edge === 'start')
                          patchSelected({
                            start: Math.min(t, (selected.end ?? video.duration) - 0.1),
                          })
                        else patchSelected({ end: Math.max(t, (selected.start ?? 0) + 0.1) })
                      }}
                    >
                      Set to playhead
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selected && (
          <Button
            variant="danger"
            size="sm"
            icon={Trash2}
            onClick={removeSelected}
            className="w-full"
          >
            Delete area <span className="opacity-60">({isMac ? '⌫' : 'Del'})</span>
          </Button>
        )}
      </div>
    </Section>
  )
}
