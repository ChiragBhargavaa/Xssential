import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { dismissToast, useToasts, type ToastTone } from '../lib/toast'
import { cx } from '../lib/utils'

const icons: Record<ToastTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
}

// Like X's snackbar: blue for news, red for errors, yellow for warnings
const tones: Record<ToastTone, string> = {
  info: 'bg-neutral-900 text-white',
  success: 'bg-neutral-900 text-white',
  warning: 'bg-x-yellow text-neutral-900',
  error: 'bg-x-red text-white',
}

export function Toasts() {
  const toasts = useToasts()
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((t) => {
        const Icon = icons[t.tone]
        return (
          <div
            key={t.id}
            role="status"
            className={cx(
              'toast-in pointer-events-auto flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-[0_0_15px_rgba(101,119,134,0.2),0_0_3px_1px_rgba(101,119,134,0.15)]',
              tones[t.tone],
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 flex-1 break-words">{t.message}</p>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.run()
                  dismissToast(t.id)
                }}
                className="shrink-0 font-bold underline-offset-2 hover:underline"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismissToast(t.id)}
              className="shrink-0 opacity-70 hover:opacity-100"
            >
              <X className="size-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
