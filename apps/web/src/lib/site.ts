export const site = {
  name: 'Xssential',
  tagline: 'The essential toolkit for your desktop.',
  description:
    'Xssential is a free, open-source desktop app for macOS and Windows. Download it, use it, and help build it.',
  repo: 'ChiragBhargavaa/Xssential',
}

export const repoUrl = `https://github.com/${site.repo}`
export const releasesUrl = `${repoUrl}/releases`

// File names are fixed by `artifactName` in apps/desktop/electron-builder.yml,
// so these links always point at the newest release.
const latest = `${releasesUrl}/latest/download`

export type Platform = 'mac' | 'windows'

export const downloads: Record<Platform, { label: string; file: string; note: string }> = {
  mac: {
    label: 'Download for macOS',
    file: `${latest}/Xssential-mac-universal.dmg`,
    note: 'macOS 12+ · Apple Silicon & Intel',
  },
  windows: {
    label: 'Download for Windows',
    file: `${latest}/Xssential-win-setup.exe`,
    note: 'Windows 10+ · 64-bit',
  },
}
