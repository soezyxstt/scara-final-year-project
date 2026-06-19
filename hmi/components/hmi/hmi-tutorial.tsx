'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { HelpCircle, ChevronRight, ChevronLeft } from 'lucide-react'
import { useHMI } from '@/lib/hmi-context'

// Persist tutorial state across page/component remounts (e.g. during Next.js router.push tab transitions)
let g_tutorialOpen = false
let g_tutorialStep = 0

interface TourStep {
  targetSelector: string
  title: string
  description: string
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  interactive?: boolean
  nextLabelOverride?: string
}

const TOUR_STEPS: TourStep[] = [
  {
    targetSelector: '', // Empty means centered fallback
    title: 'Welcome to SCARA HMI!',
    description: 'This interactive onboarding tour will guide you through the interface controls and walk you through executing your very first trajectory move command!',
    placement: 'center'
  },
  {
    targetSelector: '#hmi-connect-button',
    title: 'Connect SCARA Robot',
    description: 'Establish serial communication with the SCARA arm controller via the Web Serial API. Click this button to select a COM port and connect your hardware.',
    placement: 'bottom'
  },
  {
    targetSelector: '#hmi-hamburger-button',
    title: 'Settings & Diagnostics Menu',
    description: 'Configure angular units (radians or degrees), adjust the transparency of previous run ghost trails, customize keyboard keybindings, and download consolidated zip archives containing all 20+ diagnostic graphs and raw CSV telemetry.',
    placement: 'left'
  },
  {
    targetSelector: '#hmi-pick-point-button',
    title: 'Step 1: Enter Pick Mode',
    description: 'Let\'s set up your first move! Click the highlighted **Pick Point** button in the header of the XY Trace panel to enter selection mode.',
    placement: 'bottom',
    interactive: true,
    nextLabelOverride: 'Skip Step'
  },
  {
    targetSelector: '#hmi-xy-trace',
    title: 'Step 2: Select Target Coordinate',
    description: 'Click anywhere on the dark grid area within the reachable workspace boundaries (inside the blue arcs) to select your target coordinates.',
    placement: 'right',
    interactive: true,
    nextLabelOverride: 'Skip Step'
  },
  {
    targetSelector: '#hmi-control-panel',
    title: 'Step 3: Verify Inputs & Joint Settings',
    description: 'Notice that your selected coordinates are now loaded into the **Xf** and **Yf** fields. Here you can also adjust PID gains for J1/J2 and CTC feedforward blends.',
    placement: 'top'
  },
  {
    targetSelector: '#hmi-run-button',
    title: 'Step 4: Execute Trajectory',
    description: 'Now, click the **▶ Run** button (or click Next below to simulate) to execute your SCARA move command!',
    placement: 'bottom',
    interactive: true,
    nextLabelOverride: 'Simulate'
  },
  {
    targetSelector: '#hmi-serial-button',
    title: 'Live Serial Terminal',
    description: 'Open a real-time monitor panel at the bottom of your screen to inspect raw microcontroller exchanges, commands sent, and telemetry packets.',
    placement: 'bottom'
  },
  {
    targetSelector: '#hmi-estop-button',
    title: 'Emergency Stop & Resume',
    description: 'Instantly cut power to motors and halt trajectory execution in an emergency. Once safe, click RESUME to clear the stop state and restore active control.',
    placement: 'bottom'
  },
  {
    targetSelector: '',
    title: 'Onboarding Complete! 🎉',
    description: 'Fantastic job! You\'ve completed the tour, set targets, and executed a SCARA robot trajectory. Feel free to inspect the charts on the right and adjust motor parameters anytime!',
    placement: 'center'
  }
]

export function HMITutorial() {
  const { state, dispatch } = useHMI()
  const [stepIndex, setStepIndex] = useState(g_tutorialStep)
  const [isOpen, setIsOpen] = useState(g_tutorialOpen)
  const [rect, setRect] = useState<DOMRect | null>(null)

  // Keep global tutorial state variables in sync with React state
  useEffect(() => {
    g_tutorialOpen = isOpen
  }, [isOpen])

  useEffect(() => {
    g_tutorialStep = stepIndex
  }, [stepIndex])

  // Retrieve current step details
  const step = TOUR_STEPS[stepIndex]

  // Calculate coordinates for SVG cutout path
  const maskPath = useMemo(() => {
    if (!rect) return ''
    const pad = 6
    const rx = Math.max(0, rect.left - pad)
    const ry = Math.max(0, rect.top - pad)
    const rw = rect.width + pad * 2
    const rh = rect.height + pad * 2
    const W = typeof window !== 'undefined' ? window.innerWidth : 1920
    const H = typeof window !== 'undefined' ? window.innerHeight : 1080

    // Outer boundary (clockwise) and inner highlight hole (counter-clockwise)
    return `M 0,0 H ${W} V ${H} H 0 Z M ${rx},${ry} V ${ry + rh} H ${rx + rw} V ${ry} Z`
  }, [rect])

  // Recalculate spotlight box positions
  const updateRect = useCallback(() => {
    if (!isOpen) return
    const currentStep = TOUR_STEPS[stepIndex]
    if (!currentStep || !currentStep.targetSelector) {
      requestAnimationFrame(() => setRect(null))
      return
    }
    const el = document.querySelector(currentStep.targetSelector)
    if (el) {
      const newRect = el.getBoundingClientRect()
      requestAnimationFrame(() => setRect(newRect))
    } else {
      requestAnimationFrame(() => setRect(null))
    }
  }, [isOpen, stepIndex])

  // Handle resizing and scrolling
  useEffect(() => {
    if (!isOpen) return
    updateRect()
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [isOpen, updateRect])

  // Auto-start tutorial on first visit (short delay for HMI to load)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const completed = localStorage.getItem('hmi_tutorial_completed')
      if (completed !== 'true') {
        const timer = setTimeout(() => {
          setIsOpen(true)
        }, 1200)
        return () => clearTimeout(timer)
      }
    }
  }, [])

  // Listen for custom trigger event (e.g. from Hamburger Settings Menu)
  useEffect(() => {
    const handleStart = () => {
      g_tutorialOpen = true
      g_tutorialStep = 0
      setStepIndex(0)
      setIsOpen(true)
      // Switch back to the main Monitor tab where the tutorial controls are located
      window.dispatchEvent(new CustomEvent('hmi_switch_tab', { detail: 'monitor' }))
    }
    window.addEventListener('hmi_start_tutorial', handleStart)
    return () => window.removeEventListener('hmi_start_tutorial', handleStart)
  }, [])

  // Switch tabs programmatically if a component is monitor-specific
  useEffect(() => {
    if (!isOpen || !step) return
    const target = step.targetSelector
    if (target && ['#hmi-xy-trace', '#hmi-pick-point-button', '#hmi-control-panel', '#hmi-run-button'].includes(target)) {
      window.dispatchEvent(new CustomEvent('hmi_switch_tab', { detail: 'monitor' }))
    }
    // Give the tab content a frame to render/mount before measuring
    const timer = setTimeout(() => {
      updateRect()
    }, 150)
    return () => clearTimeout(timer)
  }, [isOpen, stepIndex, step, updateRect])

  // Listen for coordinate picking in Step 2 of the First Run Guide (index 4)
  useEffect(() => {
    if (isOpen && stepIndex === 4) {
      if (state.targetInputX !== null && state.targetInputY !== null) {
        requestAnimationFrame(() => setStepIndex(5))
      }
    }
  }, [isOpen, stepIndex, state.targetInputX, state.targetInputY])

  // Listen for actions on interactive steps
  useEffect(() => {
    if (!isOpen) return

    const currentStep = TOUR_STEPS[stepIndex]
    if (!currentStep) return

    // Clear coordinates when entering the interactive part of the guide to ensure fresh interaction
    if (stepIndex === 3) {
      dispatch({ type: 'SET_TARGET_INPUT', x: null, y: null })
    }

    let cleanup: (() => void) | null = null

    if (currentStep.targetSelector === '#hmi-pick-point-button' && stepIndex === 3) {
      const btn = document.querySelector('#hmi-pick-point-button')
      if (btn) {
        const handleClick = () => {
          setTimeout(() => {
            setStepIndex(4)
          }, 150)
        }
        btn.addEventListener('click', handleClick)
        cleanup = () => btn.removeEventListener('click', handleClick)
      }
    } else if (currentStep.targetSelector === '#hmi-run-button' && stepIndex === 6) {
      const btn = document.querySelector('#hmi-run-button')
      if (btn) {
        const handleClick = () => {
          setTimeout(() => {
            setStepIndex(7)
          }, 150)
        }
        btn.addEventListener('click', handleClick)
        cleanup = () => btn.removeEventListener('click', handleClick)
      }
    }

    return () => {
      if (cleanup) cleanup()
    }
  }, [isOpen, stepIndex, dispatch])

  const handleSkip = () => {
    setIsOpen(false)
    localStorage.setItem('hmi_tutorial_completed', 'true')
  }

  const handleNext = () => {
    if (stepIndex < TOUR_STEPS.length - 1) {
      setStepIndex(prev => prev + 1)
    } else {
      setIsOpen(false)
      localStorage.setItem('hmi_tutorial_completed', 'true')
    }
  }

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex(prev => prev - 1)
    }
  }

  // Calculate tooltip popover styling
  const getTooltipStyle = () => {
    if (!rect) return {}
    const pad = 12
    const tooltipWidth = 320
    const tooltipHeight = 220
    const W = typeof window !== 'undefined' ? window.innerWidth : 1920
    const H = typeof window !== 'undefined' ? window.innerHeight : 1080

    let left = rect.left + rect.width / 2 - tooltipWidth / 2
    let top = rect.top + rect.height + pad

    const preferredPlacement = step?.placement ?? 'bottom'

    if (preferredPlacement === 'top') {
      top = rect.top - tooltipHeight - pad
    } else if (preferredPlacement === 'left') {
      left = rect.left - tooltipWidth - pad
      top = rect.top + rect.height / 2 - tooltipHeight / 2
    } else if (preferredPlacement === 'right') {
      left = rect.left + rect.width + pad
      top = rect.top + rect.height / 2 - tooltipHeight / 2
    }

    // Boundary constraints
    if (left < 16) left = 16
    if (left + tooltipWidth > W - 16) left = W - tooltipWidth - 16
    if (top < 16) top = 16
    if (top + tooltipHeight > H - 16) {
      top = Math.max(16, rect.top - tooltipHeight - pad)
    }

    return {
      left: `${left}px`,
      top: `${top}px`,
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* ── Overlay Backdrop Mask ── */}
      <div className="fixed inset-0 z-[200] pointer-events-none select-none">
        {rect ? (
          <svg className="absolute inset-0 w-full h-full pointer-events-auto">
            <path
              d={maskPath}
              fill="rgba(4, 4, 6, 0.70)"
              fillRule="evenodd"
              className="transition-all duration-300"
            />
          </svg>
        ) : (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-xs pointer-events-auto transition-all duration-300" />
        )}
      </div>

      {/* ── Spotlight Border & Glow Outline ── */}
      {rect && (
        <div
          className="fixed border-2 border-hmi-ideal rounded-lg shadow-[0_0_24px_4px_rgba(129,140,248,0.4),inset_0_0_8px_rgba(129,140,248,0.2)] pointer-events-none z-[201] transition-all duration-300"
          style={{
            left: `${rect.left - 6}px`,
            top: `${rect.top - 6}px`,
            width: `${rect.width + 12}px`,
            height: `${rect.height + 12}px`,
          }}
        />
      )}

      {/* ── Tooltip Dialog Card ── */}
      <div
        className={cn(
          "fixed z-[202] w-80 bg-hmi-panel border border-hmi-grid backdrop-blur-md p-4 rounded-xl shadow-2xl transition-all duration-300 flex flex-col gap-3 pointer-events-auto",
          !rect ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-100" : ""
        )}
        style={rect ? getTooltipStyle() : undefined}
      >
        {/* Step progress counter */}
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-hmi-muted font-mono">
          <span className="flex items-center gap-1">
            <HelpCircle className="h-3.5 w-3.5 text-hmi-ideal" />
            {step.interactive ? 'SCARA First Run Guide' : 'SCARA Operator Guide'}
          </span>
          <span>
            {stepIndex + 1} / {TOUR_STEPS.length}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-sm font-bold text-hmi-text tracking-wide mt-1">
          {step.title}
        </h3>

        {/* Body Text */}
        <p className="text-xs text-hmi-text-secondary leading-relaxed font-normal min-h-[56px]">
          {step.description}
        </p>

        {/* Action instruction for interactive steps */}
        {step.interactive && (
          <p className="text-[10px] text-hmi-text-warning font-medium font-sans border-t border-hmi-grid pt-1.5 leading-normal">
            ⚡ Action required: Perform this action on the HMI to advance automatically, or click skip/simulate below.
          </p>
        )}

        {/* Progress Bar */}
        <div className="h-1 bg-hmi-elevated rounded-full overflow-hidden w-full border border-hmi-grid/50 mt-1">
          <div
            className="h-full bg-hmi-ideal transition-all duration-300"
            style={{ width: `${((stepIndex + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between mt-1 pt-2 border-t border-hmi-grid">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="h-7 text-[11px] text-hmi-muted hover:text-hmi-text hover:bg-hmi-btn/50 px-2"
          >
            Skip Tour
          </Button>

          <div className="flex items-center gap-1.5">
            {stepIndex > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBack}
                className="h-7 text-[11px] border-hmi-grid bg-hmi-btn/40 text-hmi-text-secondary hover:text-hmi-text hover:bg-hmi-btn-hover/60 px-2.5 flex items-center gap-0.5"
              >
                <ChevronLeft className="h-3 w-3" />
                Back
              </Button>
            )}

            <Button
              variant="default"
              size="sm"
              onClick={handleNext}
              className={cn(
                "h-7 text-[11px] text-hmi-text font-semibold shadow-md px-3 flex items-center gap-0.5 transition-all cursor-pointer",
                step.interactive 
                  ? "bg-hmi-btn hover:bg-hmi-btn-hover text-hmi-text border border-hmi-grid" 
                  : "bg-hmi-ideal hover:bg-hmi-ideal-dark"
              )}
            >
              {stepIndex === TOUR_STEPS.length - 1 ? (
                <>Finish</>
              ) : (
                <>
                  {step.nextLabelOverride || 'Next'}
                  <ChevronRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
