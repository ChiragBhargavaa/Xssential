import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Camera,
  CircleDot,
  Clapperboard,
  GalleryHorizontalEnd,
  ImagePlus,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { TOOLS, type ToolId } from '../../../shared/tools'
import { useKeydown } from '../lib/hooks'
import { cx } from '../lib/utils'

const icons: Record<ToolId, LucideIcon> = {
  screenshot: Camera,
  record: CircleDot,
  'edit-video': Clapperboard,
  settings: Settings,
  carousel: GalleryHorizontalEnd,
  'edit-image': ImagePlus,
}

// Geometry in SVG units; the window is 380 × 380 and the ring sits in its center
const SIZE = 380
const C = SIZE / 2
const OUTER = 150
const INNER = 62
const GAP = 2.5
const STEP = 360 / TOOLS.length

// Angles are measured clockwise from 12 o'clock
function polar(angle: number, radius: number) {
  const rad = (angle * Math.PI) / 180
  return { x: C + radius * Math.sin(rad), y: C - radius * Math.cos(rad) }
}

function sectorPath(index: number) {
  const mid = index * STEP
  const outerPad = (Math.asin(GAP / OUTER) * 180) / Math.PI
  const innerPad = (Math.asin(GAP / INNER) * 180) / Math.PI
  const o1 = polar(mid - STEP / 2 + outerPad, OUTER)
  const o2 = polar(mid + STEP / 2 - outerPad, OUTER)
  const i1 = polar(mid + STEP / 2 - innerPad, INNER)
  const i2 = polar(mid - STEP / 2 + innerPad, INNER)
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${OUTER} ${OUTER} 0 0 1 ${o2.x} ${o2.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${INNER} ${INNER} 0 0 0 ${i2.x} ${i2.y}`,
    'Z',
  ].join(' ')
}

export default function Wheel() {
  const [active, setActive] = useState<number | null>(null)
  // Bumped on every open to replay the entrance animation
  const [openCount, setOpenCount] = useState(0)

  useEffect(
    () =>
      window.api.wheel.onShow(() => {
        setActive(null)
        setOpenCount((n) => n + 1)
      }),
    [],
  )

  const select = (index: number) => {
    const tool = TOOLS[index]
    if (tool) window.api.tools.launch(tool.id)
  }

  // Pointing anywhere in a slice's direction highlights it, so a quick flick and click works
  const track = (e: ReactPointerEvent) => {
    const box = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - box.left - box.width / 2
    const dy = e.clientY - box.top - box.height / 2
    if (Math.hypot(dx, dy) < INNER * 0.8) {
      setActive(null)
      return
    }
    const angle = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
    setActive(Math.floor((angle + STEP / 2) / STEP) % TOOLS.length)
  }

  useKeydown((e) => {
    const n = Number(e.key)
    if (n >= 1 && n <= TOOLS.length) select(n - 1)
    else if (e.key === 'Escape') window.api.wheel.hide()
    else if (e.key === 'Enter' && active !== null) select(active)
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Tab') {
      e.preventDefault()
      setActive((a) => ((a ?? -1) + 1) % TOOLS.length)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      setActive((a) => ((a ?? 0) - 1 + TOOLS.length) % TOOLS.length)
    }
  })

  const hovered = active !== null ? TOOLS[active] : null
  const iconRadius = (OUTER + INNER) / 2

  return (
    <div
      key={openCount}
      className="wheel-in relative h-screen w-screen"
      onPointerMove={track}
      onPointerLeave={() => setActive(null)}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        if (active === null) window.api.wheel.hide()
        else select(active)
      }}
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 size-full drop-shadow-[0_0_14px_rgba(101,119,134,0.35)]"
      >
        {/* A grey plate behind the slices, so the gaps read as thin lines */}
        <circle cx={C} cy={C} r={OUTER + 5} fill="#eff3f4" stroke="#cfd9de" />
        {TOOLS.map((tool, i) => (
          <path
            key={tool.id}
            d={sectorPath(i)}
            fill={active === i ? '#0f1419' : '#ffffff'}
            stroke={active === i ? '#0f1419' : '#eff3f4'}
            strokeWidth={1}
            className="transition-[fill] duration-75"
          />
        ))}
        <circle cx={C} cy={C} r={INNER - 7} fill="#ffffff" stroke="#eff3f4" />
      </svg>

      {TOOLS.map((tool, i) => {
        const Icon = icons[tool.id]
        const p = polar(i * STEP, iconRadius)
        return (
          <div
            key={tool.id}
            className={cx(
              'pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 transition-transform duration-100',
              active === i ? 'scale-110 text-white' : 'text-neutral-900',
            )}
            style={{ left: `${(p.x / SIZE) * 100}%`, top: `${(p.y / SIZE) * 100}%` }}
          >
            <Icon className="size-6" strokeWidth={1.8} />
            <span className="text-[11px] font-bold tracking-tight whitespace-nowrap">
              {tool.label}
            </span>
          </div>
        )
      })}

      <div className="pointer-events-none absolute top-1/2 left-1/2 flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
        {hovered ? (
          <span className="text-[11px] leading-tight text-neutral-600">{hovered.hint}</span>
        ) : (
          <>
            <span className="text-2xl font-black text-neutral-900">X</span>
            <span className="text-[10px] leading-tight text-neutral-600">
              keys 1–6
              <br />
              esc to close
            </span>
          </>
        )}
      </div>
    </div>
  )
}
