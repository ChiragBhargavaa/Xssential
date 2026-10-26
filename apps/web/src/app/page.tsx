import { DownloadButtons } from '@/components/DownloadButtons'
import { LatestVersion } from '@/components/LatestVersion'
import { repoUrl, site } from '@/lib/site'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const features = [
  {
    title: 'Cross-platform',
    body: 'Native installers for macOS (Apple Silicon & Intel) and Windows.',
  },
  {
    title: 'Open source',
    body: 'MIT licensed. Read the code, report issues and send pull requests on GitHub.',
  },
  {
    title: 'Auto-updates',
    body: 'New versions are delivered automatically from GitHub Releases.',
  },
]

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-6">
        <a href={`${basePath}/`} className="flex items-center gap-2 font-semibold">
          <img src={`${basePath}/logo.png`} alt="" width={28} height={28} />
          {site.name}
        </a>
        <a href={repoUrl} className="text-sm text-zinc-400 hover:text-zinc-100">
          GitHub
        </a>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 py-20 text-center">
        <LatestVersion />
        <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
          {site.tagline}
        </h1>
        <p className="max-w-xl text-lg text-zinc-400 text-pretty">{site.description}</p>
        <DownloadButtons />

        <section className="mt-16 grid w-full gap-4 text-left sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-zinc-800 p-6">
              <h2 className="font-medium">{f.title}</h2>
              <p className="mt-2 text-sm text-zinc-400">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="flex flex-col items-center justify-between gap-2 border-t border-zinc-900 py-6 text-sm text-zinc-500 sm:flex-row">
        <span>
          MIT License · © {new Date().getFullYear()} {site.name} contributors
        </span>
        <a href={repoUrl} className="hover:text-zinc-300">
          Source on GitHub
        </a>
      </footer>
    </div>
  )
}
