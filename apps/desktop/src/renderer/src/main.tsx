import { lazy, StrictMode, Suspense, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { Toasts } from './components/Toasts'
import './styles.css'

// Every window loads this page; the hash picks the screen, e.g. #/video?mode=record
export interface RouteProps {
  params: URLSearchParams
}

const routes: Record<string, ComponentType<RouteProps>> = {
  home: lazy(() => import('./routes/Home')),
  setup: lazy(() => import('./routes/Setup')),
  wheel: lazy(() => import('./routes/Wheel')),
  capture: lazy(() => import('./routes/CaptureOverlay')),
  image: lazy(() => import('./routes/ImageEditor')),
  video: lazy(() => import('./routes/VideoStudio')),
  carousel: lazy(() => import('./routes/Carousel')),
}

const [path = '', query = ''] = window.location.hash.replace(/^#\/?/, '').split('?')
const name = path in routes ? path : 'home'
const Page = routes[name]!
document.documentElement.dataset.route = name

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Page params={new URLSearchParams(query)} />
    </Suspense>
    {name !== 'wheel' && name !== 'capture' && <Toasts />}
  </StrictMode>,
)
