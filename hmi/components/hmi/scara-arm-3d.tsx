'use client'

import { Suspense, useMemo, useEffect, useRef, useState, useCallback } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { useGLTF, OrbitControls, Line, Html, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { ARM_L1_MM, J1_MOUNT_Z_MM, J2_MOUNT_Z_MM, forwardKinematics } from '@/lib/scara-geometry'
import { checkStraightLineTrajectory, calculateIntermediatePoint } from '@/lib/trajectory-safety'
import { useTheme } from '@/components/hmi/theme-provider'

const MM = 0.001 // mm -> three.js scene meters
const L_INNER = 70.7  // mm - inner dead zone radius
const L_OUTER = 170   // mm - outer boundary radius

/**
 * Robot space (X, Y horizontal, Z up) -> three.js scene space (X, Z horizontal, Y up).
 * Robot +X maps to scene +X; Y(robot)->-Z(scene) mirroring ensures positive robot
 * rotation matches positive Three.js rotation.y.
 */
export function robotToScene(xMm: number, yMm: number, zMm = 0): [number, number, number] {
  return [xMm * MM, zMm * MM, -yMm * MM]
}

function useClonedGltf(url: string, isIdeal?: boolean, colorStr?: string) {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    const cloned = scene.clone(true)
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        if (isIdeal) {
          mesh.material = new THREE.MeshBasicMaterial({
            color: colorStr || '#60A5FA',
            transparent: true,
            opacity: 0.35,
            wireframe: false,
            depthWrite: false,
            depthTest: true,
          })
        } else {
          // Clone default material to avoid mutating global cache
          const origMat = mesh.material as THREE.MeshStandardMaterial
          const mat = origMat ? origMat.clone() : new THREE.MeshStandardMaterial()
          
          const isMainLink = child.name.toLowerCase().includes('link') || 
                             (child.parent && child.parent.name.toLowerCase().includes('link'))
          
          if (isMainLink) {
            // Main structural links base: apply vibrant colors matching the 2D capsule legend (blue-500/orange-500)
            mat.color.set(colorStr || (url.includes('j1') ? '#3b82f6' : '#f97316'))
            mat.map = null
            mat.normalMap = null
            mat.roughnessMap = null
            mat.metalnessMap = null
            mat.aoMap = null
            mat.metalness = 0.1
            mat.roughness = 0.35
            mat.transparent = false
            mat.opacity = 1.0
          } else {
            // Lighter detail elements (motors, screws): keep their colors, but ensure they are clearly lit without IBL
            mat.metalness = 0.1
            mat.roughness = 0.4
          }
          mesh.material = mat
        }
      }
    })
    return cloned
  }, [scene, isIdeal, colorStr, url])
}

const MOUNT_ALIGN_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))

export function LinkAssembly({
  url,
  yawRad,
  yawOffsetRad = 0,
  position = [0, 0, 0],
  mountQuaternion = MOUNT_ALIGN_QUAT,
  isIdeal = false,
  colorStr,
}: {
  url: string
  yawRad: number
  yawOffsetRad?: number
  position?: [number, number, number]
  mountQuaternion?: THREE.Quaternion
  isIdeal?: boolean
  colorStr?: string
}) {
  const model = useClonedGltf(url, isIdeal, colorStr)

  return (
    <group position={position} rotation={[0, yawRad + yawOffsetRad, 0]}>
      <primitive object={model} quaternion={mountQuaternion} />
    </group>
  )
}

/**
 * Renders the physical or ideal SCARA links.
 */
export function ScaraArmModels({
  th1,
  th2,
  isIdeal = false,
  j1Color = '#3B82F6',
  j2Color = '#F97316',
}: {
  th1: number
  th2: number
  isIdeal?: boolean
  j1Color?: string
  j2Color?: string
}) {
  const { elbowX, elbowY } = forwardKinematics(th1, th2)
  const link1Pos = robotToScene(0, 0, J1_MOUNT_Z_MM)
  const link2Pos = robotToScene(elbowX, elbowY, J2_MOUNT_Z_MM)

  return (
    <Suspense fallback={null}>
      {/* Zero yaw offset needed since links point along +X at zero rotation */}
      <LinkAssembly
        url="/models/j1.glb"
        yawRad={th1}
        yawOffsetRad={0}
        position={link1Pos}
        isIdeal={isIdeal}
        colorStr={j1Color}
      />
      <LinkAssembly
        url="/models/j2.glb"
        yawRad={th1 + th2}
        yawOffsetRad={0}
        position={link2Pos}
        isIdeal={isIdeal}
        colorStr={j2Color}
      />
    </Suspense>
  )
}

// Preload models for immediate display
useGLTF.preload('/models/j1.glb')
useGLTF.preload('/models/j2.glb')

/**
 * Performant component that updates the 3D SCARA arm link rotations and elbow positions
 * directly in the Three.js loop without triggering React component re-renders.
 */
function PosedArm({
  getCurrentAngles,
  isIdeal = false,
  j1Color = '#3B82F6',
  j2Color = '#F97316',
}: {
  getCurrentAngles: () => { th1: number; th2: number; th1d: number | null; th2d: number | null }
  isIdeal?: boolean
  j1Color?: string
  j2Color?: string
}) {
  const j1Ref = useRef<THREE.Group>(null)
  const j2Ref = useRef<THREE.Group>(null)

  useFrame(() => {
    const angles = getCurrentAngles()
    const th1Val = isIdeal ? angles.th1d : angles.th1
    const th2Val = isIdeal ? angles.th2d : angles.th2

    if (j1Ref.current && j2Ref.current && th1Val !== null && th2Val !== null) {
      j1Ref.current.visible = true
      j2Ref.current.visible = true

      // Update Joint 1 rotation
      j1Ref.current.rotation.y = th1Val

      // Update Joint 2 position (elbow location) and rotation
      const { elbowX, elbowY } = forwardKinematics(th1Val, th2Val)
      const link2Pos = robotToScene(elbowX, elbowY, J2_MOUNT_Z_MM)
      
      // Shift the ideal arm's Y coordinate up slightly to prevent Z-fighting when overlapping perfectly
      const yOffset = isIdeal ? 0.0005 : 0
      j2Ref.current.position.set(link2Pos[0], link2Pos[1] + yOffset, link2Pos[2])
      j2Ref.current.rotation.y = th1Val + th2Val
    } else {
      if (j1Ref.current) j1Ref.current.visible = false
      if (j2Ref.current) j2Ref.current.visible = false
    }
  })

  // Shift the ideal arm's base position up slightly to prevent Z-fighting
  const link1Pos = useMemo(() => {
    const basePos = robotToScene(0, 0, J1_MOUNT_Z_MM)
    return [basePos[0], basePos[1] + (isIdeal ? 0.0005 : 0), basePos[2]] as [number, number, number]
  }, [isIdeal])

  return (
    <Suspense fallback={null}>
      <group ref={j1Ref} position={link1Pos}>
        <LinkAssembly url="/models/j1.glb" yawRad={0} yawOffsetRad={0} isIdeal={isIdeal} colorStr={j1Color} />
      </group>
      <group ref={j2Ref}>
        <LinkAssembly url="/models/j2.glb" yawRad={0} yawOffsetRad={0} isIdeal={isIdeal} colorStr={j2Color} />
      </group>
    </Suspense>
  )
}

/**
 * 3D Reachable workspace annular sector boundary
 */
function ReachableWorkspace3D({ colors, isLight }: { colors: any; isLight: boolean }) {
  const innerRadius = L_INNER * MM
  const outerRadius = L_OUTER * MM

  const outerPoints: [number, number, number][] = []
  const innerPoints: [number, number, number][] = []

  const startAngle = -Math.PI / 6
  const endAngle = 7 * Math.PI / 6
  const segments = 64

  for (let i = 0; i <= segments; i++) {
    const theta = startAngle + (endAngle - startAngle) * (i / segments)
    outerPoints.push([Math.cos(theta) * outerRadius, 0, -Math.sin(theta) * outerRadius])
    innerPoints.push([Math.cos(theta) * innerRadius, 0, -Math.sin(theta) * innerRadius])
  }

  const workspaceColor = isLight ? colors.cyan : '#00e5ff'

  return (
    <group>
      {/* Reachable workspace sector shaded flat mesh on floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <ringGeometry args={[innerRadius, outerRadius, 64, 1, -Math.PI / 6, (4 * Math.PI) / 3]} />
        <meshBasicMaterial color={workspaceColor} transparent opacity={isLight ? 0.08 : 0.05} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Dashed outer boundary */}
      <Line points={outerPoints} color={workspaceColor} opacity={0.35} transparent lineWidth={1} dashed dashSize={0.005} gapSize={0.004} />
      {/* Dashed inner boundary */}
      <Line points={innerPoints} color={workspaceColor} opacity={0.35} transparent lineWidth={1} dashed dashSize={0.005} gapSize={0.004} />

      {/* Radial boundary edges */}
      <Line
        points={[
          [Math.cos(startAngle) * innerRadius, 0, -Math.sin(startAngle) * innerRadius],
          [Math.cos(startAngle) * outerRadius, 0, -Math.sin(startAngle) * outerRadius]
        ]}
        color={workspaceColor}
        opacity={0.35}
        transparent
        lineWidth={1}
        dashed
        dashSize={0.005}
        gapSize={0.004}
      />
      <Line
        points={[
          [Math.cos(endAngle) * innerRadius, 0, -Math.sin(endAngle) * innerRadius],
          [Math.cos(endAngle) * outerRadius, 0, -Math.sin(endAngle) * outerRadius]
        ]}
        color={workspaceColor}
        opacity={0.35}
        transparent
        lineWidth={1}
        dashed
        dashSize={0.005}
        gapSize={0.004}
      />
    </group>
  )
}

/**
 * 3D Grid lines and tick labels
 */
function Grid3D({ colors, isLight }: { colors: any; isLight: boolean }) {
  const lines: [number, number, number][][] = []
  
  const xMin = -225 * MM
  const xMax = 225 * MM
  const yMin = -125 * MM
  const yMax = 225 * MM

  // Vertical lines (constant X)
  for (let x = -200; x <= 200; x += 50) {
    lines.push([
      [x * MM, 0, -yMin],
      [x * MM, 0, -yMax]
    ])
  }

  // Horizontal lines (constant Y)
  for (let y = -100; y <= 200; y += 50) {
    lines.push([
      [xMin, 0, -y * MM],
      [xMax, 0, -y * MM]
    ])
  }

  return (
    <group>
      {/* Fine grid lines */}
      {lines.map((pts, i) => (
        <Line key={i} points={pts} color={colors.muted} opacity={isLight ? 0.22 : 0.18} transparent lineWidth={0.8} dashed dashSize={0.002} gapSize={0.002} />
      ))}

      {/* Axis lines (Brighter) */}
      <Line points={[[0, 0, -yMin], [0, 0, -yMax]]} color={colors.muted} opacity={isLight ? 0.48 : 0.38} transparent lineWidth={1.2} />
      <Line points={[[xMin, 0, 0], [xMax, 0, 0]]} color={colors.muted} opacity={isLight ? 0.48 : 0.38} transparent lineWidth={1.2} />

      {/* X Ticks (Tick numbers below horizontal axis) */}
      {[-150, -100, -50, 50, 100, 150].map((x) => (
        <Html key={`x-${x}`} position={[x * MM, 0, 12 * MM]} center pointerEvents="none" zIndexRange={[0, 10]}>
          <div className="text-[10px] font-mono text-hmi-text-secondary font-semibold select-none bg-hmi-bg/45 px-1 rounded">{x}</div>
        </Html>
      ))}

      {/* Y Ticks (Tick numbers left of vertical axis) */}
      {[-100, -50, 50, 100, 150, 200].map((y) => (
        <Html key={`y-${y}`} position={[-15 * MM, 0, -y * MM]} center pointerEvents="none" zIndexRange={[0, 10]}>
          <div className="text-[10px] font-mono text-hmi-text-secondary font-semibold select-none bg-hmi-bg/45 px-1 rounded">{y}</div>
        </Html>
      ))}

      {/* Axis titles */}
      <Html position={[180 * MM, 0, 12 * MM]} center pointerEvents="none" zIndexRange={[0, 10]}>
        <div className="text-[11px] font-semibold text-hmi-text-secondary select-none tracking-wide">X (mm)</div>
      </Html>
      <Html position={[-38 * MM, 0, -180 * MM]} center style={{ transform: 'rotate(-90deg)' }} pointerEvents="none" zIndexRange={[0, 10]}>
        <div className="text-[11px] font-semibold text-hmi-text-secondary select-none tracking-wide">Y (mm)</div>
      </Html>
    </group>
  )
}

interface TrajectoryPoint3D {
  xi: number
  yi: number
  xa: number
  ya: number
  t?: number
}

// Reachable workspace ends at 170 mm — coordinates far beyond that are
// corrupt telemetry (merged/truncated serial lines that still parsed as
// numbers). One such vertex in a fat-line geometry draws a screen-crossing
// streak and visually breaks neighboring segments, so they are dropped at
// render time too (persisted/ghost traces may predate the parser filter).
const TRACE_COORD_MAX_MM = 250
// T frames nominally arrive every 20 ms; a much larger timestamp gap means
// frames were dropped. Split the polyline there instead of bridging the gap
// with a fake straight segment (same rule as the old 2D canvas drawPath).
const TRACE_GAP_MS = 250

function isPlausibleCoord(x: number, y: number): boolean {
  return (
    Number.isFinite(x) && Number.isFinite(y) &&
    Math.abs(x) <= TRACE_COORD_MAX_MM && Math.abs(y) <= TRACE_COORD_MAX_MM
  )
}

function toTraceSegments(
  points: TrajectoryPoint3D[],
  ideal: boolean
): [number, number, number][][] {
  const segments: [number, number, number][][] = []
  let current: [number, number, number][] = []
  let prevT: number | undefined
  for (const p of points) {
    const x = ideal ? p.xi : p.xa
    const y = ideal ? p.yi : p.ya
    if (!isPlausibleCoord(x, y)) continue
    if (
      current.length > 0 &&
      prevT !== undefined && p.t !== undefined &&
      p.t - prevT > TRACE_GAP_MS
    ) {
      segments.push(current)
      current = []
    }
    if (p.t !== undefined) prevT = p.t
    current.push([x * MM, 0, -y * MM])
  }
  if (current.length > 0) segments.push(current)
  return segments
}

/**
 * 3D Trajectory lines, start sphere, target flag
 */
function Trajectory3D({
  points,
  showGhost = false,
  prevPoints = [],
  ghostOpacity = 0.2,
  recordingState,
  targetX,
  targetY,
  actualColor,
  idealColor,
  colors,
}: {
  points: TrajectoryPoint3D[]
  showGhost?: boolean
  prevPoints?: TrajectoryPoint3D[]
  ghostOpacity?: number
  recordingState?: string
  targetX?: number | null
  targetY?: number | null
  actualColor?: string
  idealColor?: string
  colors: any
}) {
  const pathZ = 0 // Render path lines on the floor (0mm)

  const idealSegments = useMemo(() => toTraceSegments(points, true), [points])
  const actualSegments = useMemo(() => toTraceSegments(points, false), [points])
  const ghostIdealSegments = useMemo(() => toTraceSegments(prevPoints, true), [prevPoints])
  const ghostActualSegments = useMemo(() => toTraceSegments(prevPoints, false), [prevPoints])

  const startPoint = useMemo(
    () => points.find((p) => isPlausibleCoord(p.xi, p.yi)) ?? null,
    [points]
  )
  const lastPoint = useMemo(() => {
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i]
      if (isPlausibleCoord(p.xi, p.yi) && isPlausibleCoord(p.xa, p.ya)) return p
    }
    return null
  }, [points])

  return (
    <group>
      {/* Ghost paths */}
      {showGhost && prevPoints.length >= 2 && (
        <group>
          {ghostIdealSegments.map((seg, i) => seg.length >= 2 && (
            <Line key={`gi-${i}`} points={seg} color="#3B82F6" lineWidth={1} dashed dashSize={0.004} gapSize={0.003} opacity={ghostOpacity} transparent />
          ))}
          {ghostActualSegments.map((seg, i) => seg.length >= 2 && (
            <Line key={`ga-${i}`} points={seg} color="#DC2626" lineWidth={1.2} opacity={ghostOpacity} transparent />
          ))}
        </group>
      )}

      {/* Ideal Path */}
      {idealSegments.map((seg, i) => seg.length >= 2 && (
        <Line key={`i-${i}`} points={seg} color={idealColor || "#2563EB"} lineWidth={1.5} dashed dashSize={0.005} gapSize={0.004} />
      ))}

      {/* Actual Path */}
      {actualSegments.map((seg, i) => seg.length >= 2 && (
        <Line key={`a-${i}`} points={seg} color={actualColor || "#DC2626"} lineWidth={2} />
      ))}

      {/* Start Point Marker (Hollow Green Sphere) */}
      {startPoint && (
        <mesh position={[startPoint.xi * MM, pathZ, -startPoint.yi * MM]}>
          <sphereGeometry args={[0.004, 16, 16]} />
          <meshBasicMaterial color={colors.start} wireframe />
        </mesh>
      )}

      {/* Live Tip Dots */}
      {recordingState === 'REC' && lastPoint && (
        <group>
          <mesh position={[lastPoint.xi * MM, pathZ, -lastPoint.yi * MM]}>
            <sphereGeometry args={[0.003, 16, 16]} />
            <meshBasicMaterial color="#2563EB" />
          </mesh>
          <mesh position={[lastPoint.xa * MM, pathZ, -lastPoint.ya * MM]}>
            <sphereGeometry args={[0.003, 16, 16]} />
            <meshBasicMaterial color="#DC2626" />
          </mesh>
        </group>
      )}

      {/* Target Flag Marker */}
      {targetX !== undefined && targetY !== undefined && targetX !== null && targetY !== null && (
        <group position={[targetX * MM, pathZ, -targetY * MM]}>
          {/* Flagpole */}
          <Line points={[[0, 0, 0], [0, 0.018, 0]]} color={colors.target} lineWidth={1.5} />
          {/* Flag shape */}
          <mesh position={[0.0035, 0.0145, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.0035, 0.007, 3]} />
            <meshBasicMaterial color={colors.target} />
          </mesh>
        </group>
      )}
    </group>
  )
}

/**
 * 3D Hover Coordinate projections and trajectory splits preview
 */
function HoverSafetyPreview3D({
  hoverPoint,
  currentPos,
  previewTarget,
  isPicking,
  colors,
}: {
  hoverPoint: { x: number; y: number } | null
  currentPos: { x: number; y: number } | null
  previewTarget: { x: number; y: number } | null
  isPicking: boolean
  colors: any
}) {
  const activeTarget = hoverPoint || previewTarget
  if (!activeTarget || !currentPos) return null

  const safety = checkStraightLineTrajectory(currentPos, activeTarget, L_INNER, L_OUTER)
  const isInnerViolation = !safety.isValid && safety.reason === 'inner_violation'
  const isPathSafe = safety.isValid || isInnerViolation

  const cpx = currentPos.x * MM
  const cpy = -currentPos.y * MM
  const tpx = activeTarget.x * MM
  const tpy = -activeTarget.y * MM

  const pathZ = 0.2 * MM // slightly above floor level to avoid grid Z-fighting
  const previewColor = isPathSafe ? colors.ok : colors.actual

  return (
    <group>
      {/* Trajectory Split / Segment line */}
      {isInnerViolation ? (
        (() => {
          const pInt = calculateIntermediatePoint(currentPos, activeTarget, L_INNER, L_OUTER)
          const ipx = pInt.x * MM
          const ipy = -pInt.y * MM
          return (
            <group>
              <Line
                points={[[cpx, pathZ, cpy], [ipx, pathZ, ipy], [tpx, pathZ, tpy]]}
                color={previewColor}
                lineWidth={1.8}
                dashed
                dashSize={0.004}
                gapSize={0.003}
              />
              <mesh position={[ipx, pathZ, ipy]}>
                <sphereGeometry args={[0.0025, 12, 12]} />
                <meshBasicMaterial color={colors.ok} />
              </mesh>
            </group>
          )
        })()
      ) : (
        <Line
          points={[[cpx, pathZ, cpy], [tpx, pathZ, tpy]]}
          color={previewColor}
          lineWidth={1.8}
          dashed
          dashSize={0.004}
          gapSize={0.003}
        />
      )}

      {/* Axis Projections & Target Indicators */}
      {hoverPoint && (
        <group>
          {/* Vertical axis line */}
          <Line points={[[hoverPoint.x * MM, pathZ, -hoverPoint.y * MM], [hoverPoint.x * MM, pathZ, 0]]} color={previewColor} lineWidth={1.0} dashed dashSize={0.003} gapSize={0.002} />
          {/* Horizontal axis line */}
          <Line points={[[hoverPoint.x * MM, pathZ, -hoverPoint.y * MM], [0, pathZ, -hoverPoint.y * MM]]} color={previewColor} lineWidth={1.0} dashed dashSize={0.003} gapSize={0.002} />

          {/* Hover target dot */}
          <mesh position={[tpx, pathZ, tpy]}>
            <sphereGeometry args={[0.003, 16, 16]} />
            <meshBasicMaterial color={previewColor} />
          </mesh>

          {/* Projection labels */}
          <Html position={[hoverPoint.x * MM, pathZ, 12 * MM]} center pointerEvents="none" zIndexRange={[0, 10]}>
            <div className="bg-hmi-panel/90 border border-hmi-grid px-1 py-0.5 rounded text-[9px] font-mono text-hmi-text font-semibold select-none shadow">
              {hoverPoint.x.toFixed(1)}
            </div>
          </Html>
          <Html position={[-15 * MM, pathZ, -hoverPoint.y * MM]} center pointerEvents="none" zIndexRange={[0, 10]}>
            <div className="bg-hmi-panel/90 border border-hmi-grid px-1 py-0.5 rounded text-[9px] font-mono text-hmi-text font-semibold select-none shadow">
              {hoverPoint.y.toFixed(1)}
            </div>
          </Html>
        </group>
      )}

      {/* Coordinate Preview Target marker (glowing core) */}
      {previewTarget && !hoverPoint && (
        <mesh position={[tpx, pathZ, tpy]}>
          <sphereGeometry args={[0.004, 16, 16]} />
          <meshBasicMaterial color={previewColor} wireframe />
        </mesh>
      )}
    </group>
  )
}

/**
 * Invisible flat plane mesh at end-effector height to capture pointer raycast events
 */
function RaycastFloor({
  isPicking,
  onPointerMoveCoords,
  onClickCoords,
}: {
  isPicking: boolean
  onPointerMoveCoords?: (coords: { x: number; y: number } | null) => void
  onClickCoords?: (coords: { x: number; y: number }) => void
}) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      visible={false}
      onPointerMove={(e) => {
        if (!isPicking) return
        e.stopPropagation()
        const xRobot = e.point.x / MM
        const yRobot = -e.point.z / MM
        onPointerMoveCoords?.({ x: xRobot, y: yRobot })
      }}
      onPointerOut={() => {
        onPointerMoveCoords?.(null)
      }}
      onClick={(e) => {
        if (!isPicking) return
        e.stopPropagation()
        const xRobot = e.point.x / MM
        const yRobot = -e.point.z / MM
        onClickCoords?.({ x: xRobot, y: yRobot })
      }}
    >
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

export interface RunData3D {
  runId: string
  runName: string
  color: string
  trajectoryPoints: {
    xi: number | null
    yi: number | null
    xa: number | null
    ya: number | null
  }[]
}

interface SCARA3DCanvasProps {
  width: number
  height: number
  showArm: boolean
  recordingState?: string
  bootPose?: { x: number; y: number; th1: number; th2: number } | null
  targetX?: number | null
  targetY?: number | null
  points: TrajectoryPoint3D[]
  prevPoints?: TrajectoryPoint3D[]
  showGhost?: boolean
  ghostOpacity?: number
  getCurrentAngles: () => { th1: number; th2: number; th1d: number | null; th2d: number | null }
  isPicking?: boolean
  onPickPoint?: (coords: { x: number; y: number }) => void
  hoverPoint?: { x: number; y: number } | null
  setHoverPoint?: (pt: { x: number; y: number } | null) => void
  previewTarget?: { x: number; y: number } | null
  currentPos?: { x: number; y: number } | null
  resetTrigger?: any
  runs?: RunData3D[]
}

function CameraInitializer({
  controlsRef,
  resetTrigger,
}: {
  controlsRef: any
  resetTrigger: any
}) {
  const { camera } = useThree()
  const hasInitializedRef = useRef(false)

  const applyCameraSetup = useCallback(() => {
    if (controlsRef.current) {
      const cameraObj = controlsRef.current.object || camera
      if (cameraObj) {
        // Set camera slightly shifted along Z to prevent polar singularity/gimbal lock in OrbitControls
        cameraObj.position.set(0, 0.45, -0.074999)
        cameraObj.up.set(0, 1, 0)
        cameraObj.lookAt(0, 0, -0.075)
      }
      controlsRef.current.target.set(0, 0, -0.075)
      controlsRef.current.update()
    }
  }, [camera, controlsRef])

  // Apply on first frame of the render loop (after OrbitControls is initialized)
  useFrame(() => {
    if (!hasInitializedRef.current && controlsRef.current) {
      hasInitializedRef.current = true
      applyCameraSetup()
    }
  })

  // Apply on reset trigger
  useEffect(() => {
    if (hasInitializedRef.current) {
      applyCameraSetup()
    }
  }, [resetTrigger, applyCameraSetup])

  return null
}

/**
 * Renders the fully 3D SCARA Trace visualizer using React Three Fiber.
 * Replaces the old 2D HTML Canvas, offering full pan/orbit/zoom 3D controls.
 */
export function SCARA3DCanvas({
  width,
  height,
  showArm,
  recordingState = 'IDLE',
  bootPose = null,
  targetX,
  targetY,
  points,
  prevPoints = [],
  showGhost = false,
  ghostOpacity = 0.2,
  getCurrentAngles,
  isPicking = false,
  onPickPoint,
  hoverPoint: externalHoverPoint,
  setHoverPoint: externalSetHoverPoint,
  previewTarget = null,
  currentPos = null,
  resetTrigger,
  runs,
}: SCARA3DCanvasProps) {
  const [localHoverPoint, setLocalHoverPoint] = useState<{ x: number; y: number } | null>(null)
  
  const hoverPoint = externalHoverPoint !== undefined ? externalHoverPoint : localHoverPoint
  const setHoverPoint = externalSetHoverPoint || setLocalHoverPoint

  const controlsRef = useRef<any>(null)

  const { theme } = useTheme()
  const isLight = theme === 'light'

  const getCSSColor = (varName: string, fallback: string): string => {
    if (typeof window === 'undefined') return fallback
    const val = window.getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
    return val || fallback
  }

  const colors = useMemo(() => {
    return {
      bg: getCSSColor('--hmi-bg', isLight ? '#FAFAFA' : '#141517'),
      grid: getCSSColor('--hmi-grid', isLight ? '#E4E4E7' : '#323439'),
      j1: getCSSColor('--hmi-j1', isLight ? '#2563EB' : '#60A5FA'),
      j1Des: getCSSColor('--hmi-j1-des', isLight ? '#3B82F6' : '#93C5FD'),
      j2: getCSSColor('--hmi-j2', isLight ? '#EA580C' : '#FB923C'),
      j2Des: getCSSColor('--hmi-j2-des', isLight ? '#F97316' : '#FDBA74'),
      actual: getCSSColor('--hmi-actual', isLight ? '#DC2626' : '#F87171'),
      start: getCSSColor('--hmi-start', isLight ? '#16A34A' : '#34D399'),
      target: getCSSColor('--hmi-target', isLight ? '#EA580C' : '#FB923C'),
      workspace: getCSSColor('--hmi-workspace', isLight ? '#71717A' : '#3F3F46'),
      ok: getCSSColor('--hmi-ok', isLight ? '#16A34A' : '#22C55E'),
      muted: getCSSColor('--hmi-muted', isLight ? '#71717A' : '#7A7E85'),
      cyan: getCSSColor('--hmi-text-cyan', isLight ? '#0891B2' : '#22D3EE'),
    }
  }, [theme, isLight])

  if (width <= 0 || height <= 0) return null

  return (
    <div className="absolute inset-0 w-full h-full select-none rounded-lg overflow-hidden border border-hmi-grid/50 bg-hmi-bg">
      <Canvas
        gl={{ alpha: true, antialias: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <CameraInitializer controlsRef={controlsRef} resetTrigger={resetTrigger} />
        <PerspectiveCamera
          makeDefault
          position={[0, 0.45, -0.074999]} // Look straight down at the workspace center
          fov={42}
          near={0.01}
          far={10}
        />
        
        <ambientLight intensity={0.75} />
        <directionalLight position={[3, 6, 3]} intensity={1.1} />
        <directionalLight position={[-3, 4, -3]} intensity={0.25} />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.05}
          minDistance={0.05}
          maxDistance={1.2}
          target={[0, 0, -75 * MM]} // Center target in workspace
          maxPolarAngle={Math.PI / 2 - 0.05} // don't go below floor level
        />

        {/* Workspace bounds, grid, and lines */}
        <Grid3D colors={colors} isLight={isLight} />
        <ReachableWorkspace3D colors={colors} isLight={isLight} />

        {/* Trajectory traces */}
        {runs ? (
          runs.map((r) => {
            const mapped = r.trajectoryPoints.map((p) => ({
              xi: p.xi ?? 0,
              yi: p.yi ?? 0,
              xa: p.xa ?? 0,
              ya: p.ya ?? 0,
            }))
            const isFirst = r.runId === runs[0].runId
            return (
              <Trajectory3D
                key={r.runId}
                points={mapped}
                actualColor={r.color}
                targetX={isFirst ? targetX : null}
                targetY={isFirst ? targetY : null}
                colors={colors}
              />
            )
          })
        ) : (
          <Trajectory3D
            points={points}
            showGhost={showGhost}
            prevPoints={prevPoints}
            ghostOpacity={ghostOpacity}
            recordingState={recordingState}
            targetX={targetX}
            targetY={targetY}
            colors={colors}
          />
        )}

        {/* Arms */}
        {showArm && (
          <group>
            <PosedArm
              getCurrentAngles={getCurrentAngles}
              isIdeal={false}
              j1Color="#3B82F6"
              j2Color="#F97316"
            />
            <PosedArm
              getCurrentAngles={getCurrentAngles}
              isIdeal={true}
              j1Color="#60A5FA"
              j2Color="#FB923C"
            />
          </group>
        )}

        {/* Raycasting previews */}
        <HoverSafetyPreview3D
          hoverPoint={hoverPoint}
          currentPos={currentPos}
          previewTarget={previewTarget}
          isPicking={isPicking}
          colors={colors}
        />

        {/* Invisible pointer catcher floor */}
        <RaycastFloor
          isPicking={isPicking}
          onPointerMoveCoords={setHoverPoint}
          onClickCoords={(coords) => {
            onPickPoint?.(coords)
            setHoverPoint(null)
          }}
        />
      </Canvas>
    </div>
  )
}
