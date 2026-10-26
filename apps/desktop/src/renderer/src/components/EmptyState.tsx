import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cx } from '../lib/utils'

// Accepts files dropped anywhere on the window
export function useFileDrop(accept: (file: File) => boolean, onFile: (file: File) => void) {
  const [dragging, setDragging] = useState(false)
  const latest = useRef({ accept, onFile })
  latest.current = { accept, onFile }

  useEffect(() => {
    let depth = 0
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      depth++
      setDragging(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const over = (e: DragEvent) => e.preventDefault()
    const drop = (e: DragEvent) => {
      e.preventDefault()
      depth = 0
      setDragging(false)
      const file = [...(e.dataTransfer?.files ?? [])].find((f) => latest.current.accept(f))
      if (file) latest.current.onFile(file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])

  return dragging
}

export function DropOverlay({ show, label }: { show: boolean; label: string }) {
  if (!show) return null
  return (
    <div className="pointer-events-none fixed inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-x-blue bg-x-blue/10 text-sm font-bold text-neutral-100 backdrop-blur-[2px]">
      {label}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon
  title: string
  description: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex flex-1 items-center justify-center p-8', className)}>
      <div className="fade-in flex max-w-md flex-col items-center text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-x-blue/10 ring-1 ring-x-blue/20">
          <Icon className="size-6 text-x-blue" />
        </div>
        <h2 className="mt-5 text-[23px] font-extrabold tracking-tight">{title}</h2>
        <div className="mt-2 text-[15px] leading-relaxed text-neutral-500">{description}</div>
        {children && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{children}</div>
        )}
      </div>
    </div>
  )
}
