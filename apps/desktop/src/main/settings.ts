import { existsSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { DEFAULT_SHORTCUT, type Settings } from '../shared/tools'

const defaults: Settings = {
  shortcut: DEFAULT_SHORTCUT,
  launchAtLogin: false,
  onboarded: false,
  resume: null,
  xHandle: null,
}

let current: Settings | null = null

const settingsPath = () => join(app.getPath('userData'), 'settings.json')

export function getSettings(): Settings {
  if (current) return current
  current = { ...defaults }
  try {
    if (existsSync(settingsPath())) {
      const saved = JSON.parse(readFileSync(settingsPath(), 'utf8')) as Partial<Settings>
      current = { ...defaults, ...saved }
    }
  } catch (err) {
    console.error('Could not read settings, using defaults', err)
  }
  return current
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  current = { ...getSettings(), ...patch }
  await writeFile(settingsPath(), JSON.stringify(current, null, 2))
  return current
}
