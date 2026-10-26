import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Loader2 } from 'lucide-react'
import type { HistoryMode } from '../lib/hooks'
import { cx, isMac } from '../lib/utils'

type Variant = 'primary' | 'inverse' | 'secondary' | 'ghost' | 'danger'

// X's pill buttons: blue for the main action, black for strong secondary actions,
// outlined for the rest
const variants: Record<Variant, string> = {
  primary:
    'bg-x-blue text-white hover:bg-x-blue-hover disabled:opacity-50 disabled:hover:bg-x-blue',
  inverse:
    'bg-neutral-900 text-white hover:bg-neutral-900/85 disabled:opacity-50 disabled:hover:bg-neutral-900',
  secondary:
    'border border-neutral-300 text-neutral-900 hover:bg-neutral-100 disabled:text-neutral-600 disabled:hover:bg-transparent',
  ghost: 'text-neutral-900 hover:bg-neutral-100 disabled:text-neutral-500',
  danger: 'border border-x-red/50 text-x-red hover:bg-x-red/10',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md'
  icon?: LucideIcon
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-bold transition-colors select-none disabled:cursor-not-allowed [-webkit-app-region:no-drag]',
        size === 'sm' ? 'h-7 px-3 text-[13px]' : 'h-9 px-4 text-sm',
        variants[variant],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        Icon && <Icon className="size-3.5" strokeWidth={2.2} />
      )}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  active?: boolean
  shortcut?: string
}

export function IconButton({
  icon: Icon,
  label,
  active,
  shortcut,
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-35 [-webkit-app-region:no-drag]',
        active
          ? 'bg-x-blue/15 text-x-blue'
          : 'text-neutral-900 hover:bg-x-blue/10 hover:text-x-blue disabled:hover:bg-transparent disabled:hover:text-neutral-900',
        className,
      )}
      {...props}
    >
      <Icon className="size-[18px]" strokeWidth={2} />
    </button>
  )
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cx('border-b border-neutral-100 px-4 py-4', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-extrabold text-neutral-900">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number, mode: HistoryMode) => void
  disabled?: boolean
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  disabled,
}: SliderProps) {
  const percent = ((value - min) / (max - min)) * 100
  return (
    <label className={cx('block', disabled && 'opacity-40')}>
      <div className="mb-1.5 flex items-center justify-between text-[13px]">
        <span className="text-neutral-900">{label}</span>
        <span className="text-neutral-600 tabular-nums">
          {Math.round(value * 100) / 100}
          {unit}
        </span>
      </div>
      <input
        type="range"
        className="slider w-full"
        style={{ '--fill': `${percent}%` } as React.CSSProperties}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value), 'transient')}
        onPointerUp={(e) => onChange(Number(e.currentTarget.value), 'commit')}
        onKeyUp={(e) => onChange(Number(e.currentTarget.value), 'commit')}
      />
    </label>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string; icon?: LucideIcon }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cx('flex rounded-full bg-neutral-50 p-1 ring-1 ring-neutral-200', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] whitespace-nowrap transition-colors',
            o.value === value
              ? 'bg-neutral-900 font-bold text-white'
              : 'font-medium text-neutral-600 hover:text-neutral-900',
          )}
        >
          {o.icon && <o.icon className="size-3.5" />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <label
      className={cx(
        'flex cursor-pointer items-start justify-between gap-3',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm text-neutral-900">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[13px] leading-snug text-neutral-600">
            {description}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-x-blue' : 'bg-neutral-300',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-4.5' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded-md border border-neutral-300 bg-white px-1 font-sans text-[11px] text-neutral-900">
      {children}
    </kbd>
  )
}

// Window top bar. On macOS it leaves room for the traffic lights and drags the window.
export function TitleBar({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <header
      className={cx(
        'flex h-13 shrink-0 items-center gap-1 border-b border-neutral-100 bg-white/85 pr-3 backdrop-blur [-webkit-app-region:drag]',
        isMac ? 'pl-20' : 'pl-3',
        className,
      )}
    >
      {children}
    </header>
  )
}

export const ToolbarDivider = () => <div className="mx-1.5 h-5 w-px bg-neutral-200" />

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
      <div
        className="h-full rounded-full bg-x-blue transition-[width] duration-200"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  )
}
