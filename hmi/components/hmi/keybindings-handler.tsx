'use client'

import { useEffect, useState } from 'react'
import { useHMISlow } from '@/lib/hmi-context'
import { loadKeybindings, HotkeyBinding } from '@/lib/keybindings-store'
import { toast } from 'sonner'
import { downloadAllGraphs } from '@/lib/capture-utils'

export function KeybindingsHandler() {
  const { state, dispatch, serial } = useHMISlow()
  const [bindings, setBindings] = useState<HotkeyBinding[]>([])

  // Load keybindings on mount and sync on changes
  useEffect(() => {
    const syncBindings = () => {
      setBindings(loadKeybindings())
    }
    syncBindings()
    window.addEventListener('hmi_keybindings_updated', syncBindings)
    return () => window.removeEventListener('hmi_keybindings_updated', syncBindings)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement
      
      // If the user is typing in an input/textarea/select, ignore keybindings
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.getAttribute('contenteditable') === 'true')
      ) {
        // Exception: Pressing Escape inside an input will blur/unfocus it
        if (e.key === 'Escape') {
          ;(active as HTMLElement).blur()
        }
        return
      }

      // Find if the pressed key matches any registered action
      // Normalize both keys to lowercase for comparison (robust to case and caps lock)
      const matchingBinding = bindings.find(
        b => b.key.toLowerCase() === e.key.toLowerCase()
      )

      if (!matchingBinding) return

      // Prevent browser default behavior (e.g. browser search for backspace or scrolling)
      e.preventDefault()

      switch (matchingBinding.action) {
        case 'TOGGLE_PICK_POINT':
          window.dispatchEvent(new Event('hmi_toggle_pick_point'))
          break

        case 'FOCUS_XF': {
          const el = document.getElementById('input-xf') as HTMLInputElement
          if (el) {
            el.focus()
            el.select()
          }
          break
        }

        case 'FOCUS_YF': {
          const el = document.getElementById('input-yf') as HTMLInputElement
          if (el) {
            el.focus()
            el.select()
          }
          break
        }

        case 'EMERGENCY_STOP':
          serial.sendCommand('estop')
          break

        case 'TOGGLE_MENU':
          window.dispatchEvent(new Event('hmi_toggle_menu'))
          break

        case 'TOGGLE_GHOST':
          dispatch({ type: 'TOGGLE_GHOST' })
          break

        case 'TOGGLE_ARM':
          window.dispatchEvent(new Event('hmi_toggle_arm_links'))
          break

        case 'CLEAR_GRAPH':
          serial.sendCommand('clrgraph')
          dispatch({ type: 'FLUSH_BUFFERS' })
          break

        case 'TAB_MONITOR':
          window.dispatchEvent(new CustomEvent('hmi_switch_tab', { detail: 'monitor' }))
          break

        case 'TAB_ANALYSIS':
          window.dispatchEvent(new CustomEvent('hmi_switch_tab', { detail: 'analysis' }))
          break

        case 'TAB_README':
          window.dispatchEvent(new CustomEvent('hmi_switch_tab', { detail: 'readme' }))
          break

        case 'SERIAL_TOGGLE':
          if (state.serialStatus === 'connected') {
            serial.disconnect()
          } else {
            serial.connect()
          }
          break

        case 'SERIAL_RECONNECT':
          serial.reconnect()
          break
          
        case 'DOWNLOAD_GRAPH': {
          const downloadEvent = new Event('hmi_download_graph', { cancelable: true })
          window.dispatchEvent(downloadEvent)
          if (!downloadEvent.defaultPrevented) {
            toast.promise(
              downloadAllGraphs({ ...state, dBuffer: [], tBuffer: [], fBuffer: [], eBuffer: [] }, false),
              {
                loading: 'Packaging all graphs into ZIP...',
                success: 'All graphs downloaded successfully!',
                error: (err) => `Export failed: ${err.message || err}`,
              }
            )
          }
          break
        }

        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [bindings, state.serialStatus, serial, dispatch])

  // This is a logic-only component, it doesn't render any UI elements
  return null
}
