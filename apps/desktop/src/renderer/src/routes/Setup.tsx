import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Loader2, MonitorUp, RotateCcw, RotateCw, ShieldCheck, Terminal } from 'lucide-react'
import { TOOLS, type AppInfo, type ScreenAccess, type ToolId } from '../../../shared/tools'
import { Button, TitleBar } from '../components/ui'
import type { RouteProps } from '../main'
import { useScreenAccess } from '../lib/permissions'
import { cx } from '../lib/utils'

// Delay before restarting once the permission shows up, so the user sees what happens
const RESTART_DELAY_MS = 1500

function Step({
  n,
  title,
  done,
  children,
  action,
}: {
  n: number
  title: string
  done: boolean
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <li className="flex gap-3.5 px-5 py-4">
      <span
        className={cx(
          'flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
          done ? 'bg-x-green text-white' : 'bg-neutral-100 text-neutral-900',
        )}
      >
        {done ? <Check className="size-4" strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold text-neutral-900">{title}</div>
        <div className="mt-0.5 text-sm leading-relaxed text-neutral-600">{children}</div>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </li>
  )
}

export default function Setup({ params }: RouteProps) {
  const toolParam = params.get('tool')
  const tool = TOOLS.find((t) => t.id === toolParam) ?? null
  const toolId = (tool?.id ?? null) as ToolId | null
  const access = useScreenAccess(1000)
  const [initial, setInitial] = useState<ScreenAccess | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [opened, setOpened] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [resetting, setResetting] = useState(false)
  const restartTimer = useRef<number | null>(null)

  useEffect(() => {
    window.api.getInfo().then(setInfo)
  }, [])

  useEffect(() => {
    if (access && initial === null) setInitial(access)
  }, [access, initial])

  // Switched on while this window was open: restart so macOS applies it. Development
  // builds can't restart themselves (the dev server would go away with them).
  useEffect(() => {
    if (access !== 'granted' || initial === null || initial === 'granted') return
    if (!info?.packaged || restartTimer.current !== null) return
    setRestarting(true)
    restartTimer.current = window.setTimeout(
      () => window.api.permissions.restart(),
      RESTART_DELAY_MS,
    )
  }, [access, initial, info])

  const alreadyAllowed = initial === 'granted' && access === 'granted'
  const dev = info !== null && !info.packaged
  const appName = dev ? 'your terminal app' : 'Xssential'
  const goal = tool ? `use ${tool.label}` : 'take screenshots and record your screen'

  const openSettings = async () => {
    await window.api.permissions.request()
    setOpened(true)
  }

  const resetPermission = async () => {
    setResetting(true)
    await window.api.permissions.reset()
    setResetting(false)
    setOpened(true)
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar>
        <span className="text-[15px] font-bold text-neutral-900">Permissions</span>
      </TitleBar>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-md px-6 py-8">
          <div className="flex size-14 items-center justify-center rounded-full bg-neutral-100">
            {alreadyAllowed || restarting ? (
              <ShieldCheck className="size-7 text-neutral-900" />
            ) : (
              <MonitorUp className="size-7 text-neutral-900" />
            )}
          </div>
          <h1 className="mt-5 text-[23px] font-extrabold tracking-tight">
            {alreadyAllowed ? 'Screen recording is allowed' : 'Allow screen recording'}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-neutral-600">
            {alreadyAllowed
              ? `Xssential can ${goal}.`
              : `To ${goal}, macOS needs you to allow Xssential to record the screen. Xssential only looks at your screen while you use a tool.`}
          </p>

          {alreadyAllowed ? (
            <div className="mt-8 flex gap-2">
              {toolId && (
                <Button
                  variant="primary"
                  onClick={() => {
                    window.api.tools.launch(toolId)
                    window.close()
                  }}
                >
                  Continue to {tool?.label}
                </Button>
              )}
              <Button variant="secondary" onClick={() => window.close()}>
                Close
              </Button>
            </div>
          ) : (
            <>
              {dev && (
                <div className="mt-6 flex gap-3 rounded-2xl border border-x-yellow/30 bg-x-yellow/10 p-4 text-sm leading-relaxed text-neutral-900">
                  <Terminal className="mt-0.5 size-4 shrink-0 text-x-orange" />
                  <p>
                    This is a development build, so macOS gives the permission to the terminal app
                    that runs <code className="font-bold">pnpm dev:desktop</code>. Switch that app
                    on, then stop and start the dev command again.
                  </p>
                </div>
              )}

              <ol className="mt-6 divide-y divide-neutral-100 rounded-2xl border border-neutral-100">
                <Step
                  n={1}
                  title="Open System Settings"
                  done={opened}
                  action={
                    <Button variant="primary" onClick={openSettings}>
                      Open System Settings
                    </Button>
                  }
                >
                  This adds {appName} to the list under Privacy & Security → Screen & System Audio
                  Recording. If macOS shows its own prompt, choose Open System Settings there too.
                </Step>
                <Step
                  n={2}
                  title={`Switch on ${appName}`}
                  done={access === 'granted'}
                  action={
                    !dev && (
                      <Button
                        variant="secondary"
                        icon={RotateCcw}
                        loading={resetting}
                        onClick={resetPermission}
                      >
                        Reset permission
                      </Button>
                    )
                  }
                >
                  Turn on the switch next to {appName}. If it isn’t in the list, click + and add it
                  from {dev ? 'Applications → Utilities' : 'Applications'}.
                  {!dev &&
                    ' Already switched on? macOS is still holding the permission for an older copy of Xssential. Reset it here, then switch Xssential on again.'}
                </Step>
                {!dev && (
                  <Step
                    n={3}
                    title="Restart Xssential"
                    done={restarting}
                    action={
                      <Button
                        variant="secondary"
                        icon={RotateCw}
                        onClick={() => window.api.permissions.restart()}
                      >
                        Restart now
                      </Button>
                    }
                  >
                    macOS applies the permission after a restart. Click{' '}
                    <span className="text-neutral-900">Quit & Reopen</span> if macOS asks, or use
                    the button.{' '}
                    {tool
                      ? `Xssential reopens and goes straight to ${tool.label}.`
                      : 'Xssential reopens on its own.'}
                  </Step>
                )}
              </ol>

              <div
                role="status"
                className={cx(
                  'mt-4 flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-bold',
                  restarting ? 'bg-x-green/15 text-x-green' : 'bg-neutral-50 text-neutral-600',
                )}
              >
                {restarting ? (
                  <>
                    <Check className="size-4" strokeWidth={3} /> Permission is on. Restarting
                    Xssential…
                  </>
                ) : (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {opened ? `Waiting for you to switch on ${appName}…` : 'Not allowed yet'}
                  </>
                )}
              </div>

              {toolId && (
                <p className="mt-6 text-center text-[13px] text-neutral-600">
                  Already switched on and restarted?{' '}
                  <button
                    type="button"
                    onClick={() => window.api.permissions.continueAnyway(toolId)}
                    className="font-bold text-x-blue hover:underline"
                  >
                    Try anyway
                  </button>
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
