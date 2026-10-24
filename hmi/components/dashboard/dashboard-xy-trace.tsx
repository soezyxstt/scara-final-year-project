'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Maximize2, Minimize2, Pause, Play, RotateCcw, Info, Box } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tooltip } from '@/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SCARA3DCanvas } from '@/components/hmi/scara-arm-3d'
import { buildReplayRecording, replayFrameAt } from '@/lib/saved-run-replay'
import type { Run, Sample, TrajectoryPoint } from '@/lib/db/schema'
import { cn } from '@/lib/utils'

export interface SavedRunDataset {
  runId: string
  runName: string
  color: string
  run: Run
  samples: Sample[]
  trajectoryPoints: TrajectoryPoint[]
}

interface Props { runs: SavedRunDataset[]; autoPlay?: boolean; onPrimaryChange?: (id: string) => void }
const timeLabel = (ms: number) => `${(ms / 1000).toFixed(2)} s`

/** Browser-only playback. This component never imports or calls the serial controller. */
export function DashboardXYTrace({ runs, autoPlay = false, onPrimaryChange }: Props) {
  const t = useTranslations('SavedRuns')
  const xy = useTranslations('XYTrace')
  const primary = runs[0]
  const recording = useMemo(() => buildReplayRecording(primary), [primary])
  const [position, setPosition] = useState(autoPlay ? 0 : recording.durationMs)
  const [playing, setPlaying] = useState(autoPlay && recording.durationMs > 0)
  const [speed, setSpeed] = useState('1')
  const [focused, setFocused] = useState(false)
  const [showArm, setShowArm] = useState(true)
  const [resetCounter, setResetCounter] = useState(0)
  const wrapper = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const clock = useRef(position)
  const pose = useRef(replayFrameAt(recording, position, false).pose)

  useEffect(() => {
    const element = wrapper.current
    if (!element) return
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    let previous: number | null = null
    let paint = 0
    const tick = (now: number) => {
      if (previous !== null) clock.current = Math.min(recording.durationMs, clock.current + (now - previous) * Number(speed))
      previous = now
      pose.current = replayFrameAt(recording, clock.current, false).pose
      if (now - paint >= 40 || clock.current >= recording.durationMs) {
        setPosition(clock.current)
        paint = now
      }
      if (clock.current >= recording.durationMs) setPlaying(false)
      else frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    const onVisibilityChange = () => { if (document.hidden) setPlaying(false) }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [playing, speed, recording])

  useEffect(() => {
    if (!focused) return
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setFocused(false) }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [focused])

  const seek = (time: number) => {
    setPlaying(false)
    clock.current = time
    pose.current = replayFrameAt(recording, time, false).pose
    setPosition(time)
  }
  const togglePlay = () => {
    if (playing) { setPlaying(false); setPosition(clock.current); return }
    if (clock.current >= recording.durationMs) seek(0)
    setPlaying(true)
  }
  const getCurrentAngles = useCallback(() => pose.current ?? { th1: 0, th2: 0, th1d: null, th2d: null }, [])
  const current = useMemo(() => replayFrameAt(recording, position), [recording, position])
  const visibleRuns = useMemo(() => runs.map((run, index) => index === 0 ? { ...run, trajectoryPoints: current.trail } : run), [runs, current.trail])
  const tip = current.point
  const error = tip ? Math.hypot(tip.xa - tip.xi, tip.ya - tip.yi) : null
  const hasData = current.pose !== null
  const canReplay = recording.durationMs > 0 && hasData
  const timingHint = recording.timing === 'snapshot' ? t('snapshotOnly') : recording.coordinatesOnly ? `${t('coordinatesOnly')} ${t('partialReplay')}` : recording.pathFrames.length > 1 ? t('partialReplay') : t('recordedTime')

  return (
    <section className={cn('saved-replay bg-hmi-panel overflow-hidden flex flex-col', focused && 'saved-replay-focused')} data-capture-chart="xy" data-export-surface="" aria-label={t('workspace')} data-replay-run={primary.runId}>
      <header className="saved-replay-header">
        {runs.length > 1 && onPrimaryChange ? <Select value={primary.runId} onValueChange={onPrimaryChange}>
          <SelectTrigger aria-label={t('run')} className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>{runs.map(run => <SelectItem key={run.runId} value={run.runId}>{run.runName}</SelectItem>)}</SelectContent>
        </Select> : <h2 className="font-semibold text-sm truncate">{primary.runName}</h2>}
        <div className="flex items-center gap-2">
          <span className="text-xs text-hmi-muted hidden sm:inline">{t('replayOnly')}</span>
          <Tooltip content={timingHint}><Button variant="ghost" size="icon" aria-label={timingHint} className="size-8"><Info size={15} /></Button></Tooltip>
          <Button variant="outline" size="sm" aria-pressed={showArm} onClick={() => setShowArm(value => !value)}><Box size={14} />{xy('armLinks')}</Button>
          <Button variant="ghost" size="icon" aria-label={xy('resetZoomTooltip')} onClick={() => setResetCounter(value => value + 1)} className="size-8"><RotateCcw size={15} /></Button>
          <Button variant="ghost" size="icon" aria-label={focused ? xy('collapseTooltip') : xy('expandTooltip')} onClick={() => setFocused(value => !value)} className="size-8">{focused ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</Button>
        </div>
      </header>
      <div ref={wrapper} className="relative flex-1 min-h-0" data-replay-viewport>
        {hasData ? <SCARA3DCanvas width={size.width} height={size.height} showArm={showArm} points={[]} runs={visibleRuns} getCurrentAngles={getCurrentAngles} resetTrigger={resetCounter} /> : <div className="h-full grid place-items-center text-sm text-hmi-muted">{t('noReplayData')}</div>}
        {hasData && <div className="saved-replay-legend"><span><i className="border-t-2 border-dashed border-hmi-ideal" />{t('desired')}</span><span><i className="border-t-2" style={{ borderColor: primary.color }} />{t('actual')}</span></div>}
      </div>
      {tip && <dl className="saved-replay-coordinates">
        <div><dt>{t('desired')} X/Y <span>(mm)</span></dt><dd>{tip.xi.toFixed(1)}, {tip.yi.toFixed(1)}</dd></div>
        <div><dt>{t('actual')} X/Y <span>(mm)</span></dt><dd data-replay-coordinates>{tip.xa.toFixed(1)}, {tip.ya.toFixed(1)}</dd></div>
        <div><dt>{t('error')}</dt><dd>{error?.toFixed(2)} <span className="text-hmi-muted">mm</span></dd></div>
      </dl>}
      <div className="saved-replay-transport">
        <Button variant="outline" size="sm" disabled={!canReplay} aria-label={playing ? t('pause') : t('play')} onClick={togglePlay}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? t('pause') : t('play')}</Button>
        <Button variant="ghost" size="icon" disabled={!canReplay} aria-label={t('restart')} onClick={() => seek(0)} className="size-8"><RotateCcw size={15} /></Button>
        <output className="font-mono text-xs tabular-nums text-hmi-text-secondary" data-replay-time>{timeLabel(position)} / {timeLabel(recording.durationMs)}</output>
        <Select value={speed} onValueChange={setSpeed} disabled={!canReplay}><SelectTrigger aria-label={t('speed')} className="w-20 h-8 ml-auto"><SelectValue /></SelectTrigger><SelectContent>{['0.25', '0.5', '1', '2', '4'].map(value => <SelectItem key={value} value={value}>{value}×</SelectItem>)}</SelectContent></Select>
        <Slider className="saved-replay-timeline" aria-label={t('replayTimeline')} value={[position]} min={0} max={recording.durationMs || 1} step={1} disabled={!canReplay} onValueChange={values => seek(values[0])} />
      </div>
    </section>
  )
}
