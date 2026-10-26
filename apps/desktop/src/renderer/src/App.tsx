import { useEffect, useState } from 'react'

export default function App(): React.JSX.Element {
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.api.getVersion().then(setVersion)
  }, [])

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4 bg-neutral-950 text-neutral-100 [-webkit-app-region:drag]">
      <h1 className="text-5xl font-semibold tracking-tight">Xssential</h1>
      <p className="text-neutral-400">Your app starts here.</p>
      <p className="text-xs text-neutral-600">
        v{version} · {window.api.platform}
      </p>
    </main>
  )
}
