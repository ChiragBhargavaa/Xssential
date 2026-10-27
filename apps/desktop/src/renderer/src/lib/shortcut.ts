import { isMac } from './utils'

const named: Record<string, string> = {
  Space: 'Space',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
}

function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^F\d{1,2}$/.test(code)) return code
  return named[code] ?? null
}

// Turns a key press into an Electron accelerator string, e.g. "Alt+Shift+X".
// Returns null while only modifiers are held, or for keys that need a modifier.
export function acceleratorFromEvent(e: KeyboardEvent): string | null {
  const key = keyName(e.code)
  if (!key) return null
  const mods: string[] = []
  if (e.metaKey) mods.push(isMac ? 'Command' : 'Super')
  if (e.ctrlKey) mods.push('Control')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (mods.length === 0 && !/^F\d+$/.test(key)) return null
  return [...mods, key].join('+')
}

const macSymbols: Record<string, string> = {
  Command: '⌘',
  Cmd: '⌘',
  CommandOrControl: '⌘',
  CmdOrCtrl: '⌘',
  Control: '⌃',
  Ctrl: '⌃',
  Alt: '⌥',
  Option: '⌥',
  Shift: '⇧',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Enter: '↩',
  Backspace: '⌫',
  Space: 'Space',
}

const winNames: Record<string, string> = {
  CommandOrControl: 'Ctrl',
  CmdOrCtrl: 'Ctrl',
  Control: 'Ctrl',
  Super: 'Win',
}

// Splits an accelerator into the keys to show, e.g. ["⌥", "⇧", "X"] on macOS
export function acceleratorKeys(accelerator: string): string[] {
  return accelerator
    .split('+')
    .map((part) => (isMac ? (macSymbols[part] ?? part) : (winNames[part] ?? part)))
}
