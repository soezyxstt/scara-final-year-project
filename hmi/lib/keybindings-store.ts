'use client'

export type HMIHotkeyAction =
  | 'TOGGLE_PICK_POINT'
  | 'FOCUS_XF'
  | 'FOCUS_YF'
  | 'EMERGENCY_STOP'
  | 'TOGGLE_MENU'
  | 'TOGGLE_GHOST'
  | 'TOGGLE_ARM'
  | 'CLEAR_GRAPH'
  | 'TAB_MONITOR'
  | 'TAB_ANALYSIS'
  | 'TAB_README'
  | 'SERIAL_TOGGLE'
  | 'SERIAL_RECONNECT'
  | 'DOWNLOAD_GRAPH'

export interface HotkeyBinding {
  action: HMIHotkeyAction
  key: string // e.g. 'p', 'x', 'y', 'Backspace', 'm', 'g', 'a', 'c', '1', '2', '3', 's', 'r', 'd'
  label: string // descriptive text for UI
}

export const DEFAULT_KEYBINDINGS: HotkeyBinding[] = [
  { action: 'TOGGLE_PICK_POINT', key: 'p', label: 'Toggle Pick Point Mode' },
  { action: 'FOCUS_XF', key: 'x', label: 'Focus Xf Input' },
  { action: 'FOCUS_YF', key: 'y', label: 'Focus Yf Input' },
  { action: 'EMERGENCY_STOP', key: 'Backspace', label: 'Emergency Stop (E-Stop)' },
  { action: 'TOGGLE_MENU', key: 'm', label: 'Toggle Settings Menu' },
  { action: 'TOGGLE_GHOST', key: 'g', label: 'Toggle Ghost Path Trails' },
  { action: 'TOGGLE_ARM', key: 'a', label: 'Toggle SCARA Arm Links' },
  { action: 'CLEAR_GRAPH', key: 'c', label: 'Clear Graph & Buffers' },
  { action: 'TAB_MONITOR', key: '1', label: 'Switch to Monitor Tab' },
  { action: 'TAB_ANALYSIS', key: '2', label: 'Switch to Analysis Tab' },
  { action: 'TAB_README', key: '3', label: 'Switch to README Tab' },
  { action: 'SERIAL_TOGGLE', key: 's', label: 'Connect/Disconnect Serial' },
  { action: 'SERIAL_RECONNECT', key: 'r', label: 'Reconnect Last Serial Port' },
  { action: 'DOWNLOAD_GRAPH', key: 'd', label: 'Download Graph(s)' },
]

const LS_KEY = 'hmi_keybindings'

export function loadKeybindings(): HotkeyBinding[] {
  if (typeof window === 'undefined') return DEFAULT_KEYBINDINGS
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_KEYBINDINGS
    const parsed = JSON.parse(raw) as HotkeyBinding[]
    
    // Ensure all actions are present (migration/safety)
    const merged = DEFAULT_KEYBINDINGS.map(def => {
      const found = parsed.find(p => p.action === def.action)
      return found ? { ...def, key: found.key } : def
    })
    return merged
  } catch {
    return DEFAULT_KEYBINDINGS
  }
}

export function saveKeybindings(bindings: HotkeyBinding[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(bindings))
    window.dispatchEvent(new Event('hmi_keybindings_updated'))
  } catch (err) {
    console.error('Failed to save keybindings:', err)
  }
}

export function resetKeybindings(): HotkeyBinding[] {
  saveKeybindings(DEFAULT_KEYBINDINGS)
  return DEFAULT_KEYBINDINGS
}
