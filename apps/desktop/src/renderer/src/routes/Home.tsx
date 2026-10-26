import { useCallback, useEffect, useState } from 'react'
import {
  Camera,
  CircleDot,
  Clapperboard,
  GalleryHorizontalEnd,
  ImagePlus,
  Keyboard,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { TOOLS, type Settings, type ToolId } from '../../../shared/tools'
import { Button, Kbd, TitleBar, Toggle } from '../components/ui'
import { useScreenAccess } from '../lib/permissions'
import { acceleratorFromEvent, acceleratorKeys } from '../lib/shortcut'
import { toast } from '../lib/toast'
import { cx, isMac } from '../lib/utils'

const toolIcons: Partial<Record<ToolId, LucideIcon>> = {
  screenshot: Camera,
  record: CircleDot,
  'edit-video': Clapperboard,
  carousel: GalleryHorizontalEnd,
  'edit-image': ImagePlus,
}

function Shortcut({ accelerator, large }: { accelerator: string; large?: boolean }) {
  return (
    <span className="inline-flex gap-1">
      {acceleratorKeys(accelerator).map((k, i) =>
        large ? (
          <kbd
            key={i}
            className="inline-flex min-w-9 items-center justify-center rounded-lg border border-neutral-300 bg-white px-2 py-1 font-sans text-base font-bold text-neutral-900 shadow-[0_2px_0_0_#cfd9de]"
          >
            {k}
          </kbd>
        ) : (
          <Kbd key={i}>{k}</Kbd>
        ),
      )}
    </span>
  )
}

function ShortcutRecorder({
  value,
  onChange,
}: {
  value: string
  onChange: (accelerator: string) => void
}) {
  const [listening, setListening] = useState(false)

  useEffect(() => {
    if (!listening) return undefined
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setListening(false)
        return
      }
      const accelerator = acceleratorFromEvent(e)
      if (accelerator) {
        setListening(false)
        onChange(accelerator)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [listening, onChange])

  return (
    <button
      type="button"
      onClick={() => setListening((l) => !l)}
      onBlur={() => setListening(false)}
      className={cx(
        'flex h-9 min-w-40 items-center justify-center rounded-full px-4 text-sm font-bold ring-1 transition-colors',
        listening
          ? 'bg-x-blue/10 text-x-blue ring-x-blue'
          : 'text-neutral-900 ring-neutral-300 hover:bg-neutral-100',
      )}
    >
      {listening ? 'Press the new shortcut…' : <Shortcut accelerator={value} />}
    </button>
  )
}

export default function Home() {
  const [settings, setSettings] = useState<(Settings & { shortcutActive: boolean }) | null>(null)
  const [version, setVersion] = useState('')
  const access = useScreenAccess()
  const needsPermission = isMac && access !== null && access !== 'granted'

  useEffect(() => {
    window.api.settings.get().then(setSettings)
    window.api.getVersion().then(setVersion)
  }, [])

  const changeShortcut = useCallback(async (accelerator: string) => {
    const result = await window.api.settings.setShortcut(accelerator)
    if (result.ok) {
      setSettings((s) => (s ? { ...s, shortcut: accelerator, shortcutActive: true } : s))
      toast('Shortcut updated', { tone: 'success' })
    } else {
      toast(result.error ?? 'Could not use that shortcut', { tone: 'error' })
    }
  }, [])

  const tools = TOOLS.filter((t) => t.id !== 'settings')
  const trayPlace = isMac
    ? 'menu bar at the top of your screen'
    : 'notification area of the taskbar'

  return (
    <div className="flex h-full flex-col">
      <TitleBar>
        <span className="text-[15px] font-bold text-neutral-900">Xssential</span>
      </TitleBar>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-10">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-x-blue text-3xl font-black text-white">
              X
            </div>
            <div>
              <h1 className="text-[23px] font-extrabold tracking-tight">Xssential</h1>
              <p className="mt-0.5 text-[15px] text-neutral-600">
                Screenshots, screen recordings and carousels, ready for X.
              </p>
            </div>
          </div>

          {needsPermission && (
            <div className="mt-8 flex items-center gap-4 rounded-2xl border border-x-yellow/30 bg-x-yellow/10 px-5 py-4">
              <ShieldAlert className="size-5 shrink-0 text-x-yellow" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-neutral-900">
                  Screen recording is off
                </div>
                <div className="mt-0.5 text-sm text-neutral-600">
                  Screenshots and recordings need macOS's permission. It takes a minute to set up.
                </div>
              </div>
              <Button variant="inverse" onClick={() => window.api.permissions.openSetup()}>
                Set up
              </Button>
            </div>
          )}

          {settings && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-100 px-5 py-4">
              <span className="text-[15px] text-neutral-900">Press</span>
              <Shortcut accelerator={settings.shortcut} large />
              <span className="text-[15px] text-neutral-900">
                anywhere to open the tool wheel. Xssential stays in the {trayPlace}.
              </span>
            </div>
          )}

          <h2 className="mt-10 mb-3 text-xl font-extrabold text-neutral-900">Tools</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {tools.map((tool) => {
              const Icon = toolIcons[tool.id]!
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => window.api.tools.launch(tool.id)}
                  className="group rounded-2xl border border-neutral-100 p-4 text-left transition-colors hover:bg-neutral-50"
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-x-blue/10 transition-colors group-hover:bg-x-blue/20">
                    <Icon className="size-5 text-x-blue" />
                  </span>
                  <div className="mt-3 text-[15px] font-bold text-neutral-900">{tool.label}</div>
                  <div className="mt-1 text-[13px] leading-relaxed text-neutral-600">
                    {tool.hint}
                  </div>
                </button>
              )
            })}
          </div>

          <h2 className="mt-10 mb-3 text-xl font-extrabold text-neutral-900">Settings</h2>
          <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-100">
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-start gap-3">
                <Keyboard className="mt-0.5 size-4 text-neutral-600" />
                <div>
                  <div className="text-[15px] font-bold text-neutral-900">Tool wheel shortcut</div>
                  <div className="mt-0.5 text-[13px] text-neutral-600">
                    Works in every app. Press it again to close the wheel, or to stop a recording.
                  </div>
                  {settings && !settings.shortcutActive && (
                    <div className="mt-1.5 text-[13px] text-x-yellow">
                      Another app is using this shortcut, so it doesn't work right now. Pick a
                      different one.
                    </div>
                  )}
                </div>
              </div>
              {settings && <ShortcutRecorder value={settings.shortcut} onChange={changeShortcut} />}
            </div>

            <div className="px-5 py-4">
              {settings && (
                <Toggle
                  label="Open at login"
                  description="Start Xssential in the background when you sign in."
                  checked={settings.launchAtLogin}
                  onChange={(enabled) => {
                    setSettings({ ...settings, launchAtLogin: enabled })
                    void window.api.settings.setLaunchAtLogin(enabled)
                  }}
                />
              )}
            </div>

            {isMac && (
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex items-start gap-3">
                  {access === 'granted' ? (
                    <ShieldCheck className="mt-0.5 size-4 text-x-green" />
                  ) : (
                    <ShieldAlert className="mt-0.5 size-4 text-x-yellow" />
                  )}
                  <div>
                    <div className="text-[15px] font-bold text-neutral-900">
                      Screen recording permission
                    </div>
                    <div className="mt-0.5 text-[13px] text-neutral-600">
                      {access === 'granted'
                        ? 'Allowed. Screenshots and recordings are ready to go.'
                        : 'Needed for screenshots and recordings. Xssential walks you through it and restarts itself when it is on.'}
                    </div>
                  </div>
                </div>
                {needsPermission && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => window.api.permissions.openSetup()}
                  >
                    Set up
                  </Button>
                )}
              </div>
            )}
          </div>

          <p className="mt-8 text-center text-[13px] text-neutral-600">
            Xssential {version} · Free and open source (MIT)
          </p>
        </div>
      </main>
    </div>
  )
}
