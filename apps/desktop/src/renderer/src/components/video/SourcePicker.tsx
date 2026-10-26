import { useCallback, useEffect, useState } from 'react'
import { AppWindow, CircleDot, Monitor, MonitorUp, RefreshCw } from 'lucide-react'
import type { CaptureSource } from '../../../../shared/tools'
import { useScreenAccess } from '../../lib/permissions'
import { cx, isMac } from '../../lib/utils'
import { Button, Segmented, Toggle } from '../ui'

export interface RecordOptions {
  sourceId: string
  fps: 30 | 60
  countdown: boolean
}

function SourceCard({
  source,
  selected,
  onSelect,
  onStart,
}: {
  source: CaptureSource
  selected: boolean
  onSelect: () => void
  onStart: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onStart}
      className={cx(
        'group flex flex-col gap-2 rounded-xl p-2 text-left ring-1 transition-colors',
        selected
          ? 'bg-x-blue/10 ring-x-blue'
          : 'bg-neutral-50 ring-neutral-200 hover:ring-neutral-300',
      )}
    >
      <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-black">
        <img
          src={source.thumbnail}
          alt=""
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
      </div>
      <div className="flex min-w-0 items-center gap-1.5 px-1 pb-0.5">
        {source.icon ? (
          <img src={source.icon} alt="" className="size-4 shrink-0" />
        ) : source.kind === 'screen' ? (
          <Monitor className="size-4 shrink-0 text-neutral-600" />
        ) : (
          <AppWindow className="size-4 shrink-0 text-neutral-600" />
        )}
        <span className="truncate text-xs text-neutral-900">{source.name}</span>
      </div>
    </button>
  )
}

export function SourcePicker({ onStart }: { onStart: (options: RecordOptions) => void }) {
  const [sources, setSources] = useState<CaptureSource[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [fps, setFps] = useState<'30' | '60'>('30')
  const [countdown, setCountdown] = useState(true)
  const access = useScreenAccess()
  const needsPermission = isMac && access !== null && access !== 'granted'

  const refresh = useCallback(() => {
    window.api.recorder.getSources().then((list) => {
      setSources(list)
      setSelected((current) =>
        current && list.some((s) => s.id === current)
          ? current
          : (list.find((s) => s.kind === 'screen')?.id ?? null),
      )
    })
  }, [])

  useEffect(refresh, [refresh])

  const start = (id = selected) => {
    if (id) onStart({ sourceId: id, fps: fps === '60' ? 60 : 30, countdown })
  }

  const screens = sources?.filter((s) => s.kind === 'screen') ?? []
  const windows = sources?.filter((s) => s.kind === 'window') ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">What do you want to record?</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Pick a screen or a window. You can crop to any area afterwards.
              </p>
            </div>
            <Button size="sm" variant="ghost" icon={RefreshCw} onClick={refresh}>
              Refresh
            </Button>
          </div>

          {sources === null ? (
            <p className="mt-10 text-sm text-neutral-600">Looking for screens and windows…</p>
          ) : needsPermission ? (
            <div className="mt-8 flex flex-col items-center rounded-2xl border border-neutral-100 px-6 py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-x-blue/15">
                <MonitorUp className="size-6 text-x-blue" />
              </span>
              <div className="mt-4 text-[17px] font-extrabold text-neutral-900">
                Allow screen recording first
              </div>
              <p className="mt-1 max-w-sm text-sm text-neutral-600">
                macOS has to allow Xssential to see your screen. It takes a minute, and Xssential
                comes back here on its own afterwards.
              </p>
              <Button
                variant="primary"
                className="mt-5"
                onClick={() => window.api.permissions.openSetup('record')}
              >
                Set up permission
              </Button>
            </div>
          ) : sources.length === 0 ? (
            <p className="mt-10 text-sm text-neutral-600">
              No screens are available right now. Try Refresh.
            </p>
          ) : (
            <>
              <h3 className="mt-6 mb-2.5 text-[15px] font-extrabold text-neutral-900">Screens</h3>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {screens.map((s) => (
                  <SourceCard
                    key={s.id}
                    source={s}
                    selected={s.id === selected}
                    onSelect={() => setSelected(s.id)}
                    onStart={() => start(s.id)}
                  />
                ))}
              </div>
              {windows.length > 0 && (
                <>
                  <h3 className="mt-8 mb-2.5 text-[15px] font-extrabold text-neutral-900">
                    Windows
                  </h3>
                  <div className="grid grid-cols-3 gap-3 lg:grid-cols-4">
                    {windows.map((s) => (
                      <SourceCard
                        key={s.id}
                        source={s}
                        selected={s.id === selected}
                        onSelect={() => setSelected(s.id)}
                        onStart={() => start(s.id)}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-6 border-t border-neutral-100 bg-white px-8 py-3.5">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-neutral-600">Frame rate</span>
            <Segmented
              className="w-32"
              value={fps}
              onChange={setFps}
              options={[
                { value: '30', label: '30 fps' },
                { value: '60', label: '60 fps' },
              ]}
            />
          </div>
          <div className="w-56">
            <Toggle label="3-second countdown" checked={countdown} onChange={setCountdown} />
          </div>
        </div>
        <Button variant="primary" icon={CircleDot} disabled={!selected} onClick={() => start()}>
          Start recording
        </Button>
      </footer>
    </div>
  )
}
