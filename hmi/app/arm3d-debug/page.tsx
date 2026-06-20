'use client'

import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Line, Html, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { LinkAssembly, robotToScene } from '@/components/hmi/scara-arm-3d'
import { forwardKinematics, J1_MOUNT_Z_MM, J2_MOUNT_Z_MM } from '@/lib/scara-geometry'

const D2R = Math.PI / 180

function EulerSliders({ label, deg, setDeg }: { label: string; deg: [number, number, number]; setDeg: (d: [number, number, number]) => void }) {
  return (
    <div style={{ marginTop: 6, borderTop: '1px solid #333', paddingTop: 6 }}>
      <div>{label}</div>
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <div key={axis}>
          <span>{axis}: {deg[i]}°</span>
          <input
            type="range" min={-180} max={180} value={deg[i]}
            onChange={(e) => {
              const next: [number, number, number] = [...deg]
              next[i] = Number(e.target.value)
              setDeg(next)
            }}
            style={{ width: 200, display: 'block' }}
          />
        </div>
      ))}
    </div>
  )
}

function Marker({ pos, color, label }: { pos: [number, number, number]; color: string; label: string }) {
  return (
    <group position={pos}>
      <mesh>
        <sphereGeometry args={[0.012, 16, 16]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      <Html><div style={{ color, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{label}</div></Html>
    </group>
  )
}

function AxisGizmo() {
  return (
    <>
      <Line points={[[0, 0, 0], [0.2, 0, 0]]} color="red" lineWidth={2} />
      <Html position={[0.22, 0, 0]}><div style={{ color: 'red', fontSize: 12 }}>+X (theta=0)</div></Html>
      <Line points={[[0, 0, 0], [0, 0.2, 0]]} color="green" lineWidth={2} />
      <Html position={[0, 0.22, 0]}><div style={{ color: 'green', fontSize: 12 }}>+Y (up)</div></Html>
      <Line points={[[0, 0, 0], [0, 0, -0.2]]} color="blue" lineWidth={2} />
      <Html position={[0, 0, -0.22]}><div style={{ color: 'blue', fontSize: 12 }}>theta=90 (-Z)</div></Html>
    </>
  )
}

export default function ArmDebugPage() {
  const [th1Deg, setTh1Deg] = useState(0)
  const [th2Deg, setTh2Deg] = useState(0)
  const [j1MountDeg, setJ1MountDeg] = useState<[number, number, number]>([-90, 0, 0])
  const [j2MountDeg, setJ2MountDeg] = useState<[number, number, number]>([-90, 0, 0])
  const [j1YawOffsetDeg, setJ1YawOffsetDeg] = useState(0)
  const [j2YawOffsetDeg, setJ2YawOffsetDeg] = useState(0)



  const th1 = th1Deg * D2R
  const th2 = th2Deg * D2R
  const { elbowX, elbowY, tipX, tipY } = forwardKinematics(th1, th2)

  const j1Quat = useMemo(
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(j1MountDeg[0] * D2R, j1MountDeg[1] * D2R, j1MountDeg[2] * D2R, 'XYZ')),
    [j1MountDeg]
  )
  const j2Quat = useMemo(
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(j2MountDeg[0] * D2R, j2MountDeg[1] * D2R, j2MountDeg[2] * D2R, 'XYZ')),
    [j2MountDeg]
  )

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#111', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, color: 'white', background: '#000a', padding: 12, borderRadius: 8, fontFamily: 'monospace', fontSize: 11, maxHeight: '95vh', overflowY: 'auto' }}>
        <div>th1: {th1Deg}°</div>
        <input type="range" min={-180} max={180} value={th1Deg} onChange={(e) => setTh1Deg(Number(e.target.value))} style={{ width: 200 }} />
        <div>th2: {th2Deg}°</div>
        <input type="range" min={-180} max={180} value={th2Deg} onChange={(e) => setTh2Deg(Number(e.target.value))} style={{ width: 200 }} />
        <div style={{ marginTop: 8, opacity: 0.7 }}>Red=+X(theta=0) Green=+Y(up) Blue=theta=90</div>

        <EulerSliders label="J1 mount XYZ" deg={j1MountDeg} setDeg={setJ1MountDeg} />
        <div>J1 yawOffset: {j1YawOffsetDeg}°</div>
        <input type="range" min={-180} max={180} value={j1YawOffsetDeg} onChange={(e) => setJ1YawOffsetDeg(Number(e.target.value))} style={{ width: 200 }} />

        <EulerSliders label="J2 mount XYZ" deg={j2MountDeg} setDeg={setJ2MountDeg} />
        <div>J2 yawOffset: {j2YawOffsetDeg}°</div>
        <input type="range" min={-180} max={180} value={j2YawOffsetDeg} onChange={(e) => setJ2YawOffsetDeg(Number(e.target.value))} style={{ width: 200 }} />
      </div>
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} fov={40} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[1, 2, 1]} intensity={1.2} />
        <directionalLight position={[-1, 1, -1]} intensity={0.4} />
        <Grid args={[1, 1]} cellSize={0.01} sectionSize={0.05} infiniteGrid fadeDistance={1} />
        <AxisGizmo />
        <Marker pos={robotToScene(0, 0, J1_MOUNT_Z_MM)} color="cyan" label="base(0,0)" />
        <Marker pos={robotToScene(elbowX, elbowY, J2_MOUNT_Z_MM)} color="yellow" label="elbow" />
        <Marker pos={robotToScene(tipX, tipY, J2_MOUNT_Z_MM)} color="magenta" label="tip" />
        <LinkAssembly
          url="/models/j1.glb"
          yawRad={th1}
          yawOffsetRad={j1YawOffsetDeg * D2R}
          position={robotToScene(0, 0, J1_MOUNT_Z_MM)}
          mountQuaternion={j1Quat}
        />
        <LinkAssembly
          url="/models/j2.glb"
          yawRad={th1 + th2}
          yawOffsetRad={j2YawOffsetDeg * D2R}
          position={robotToScene(elbowX, elbowY, J2_MOUNT_Z_MM)}
          mountQuaternion={j2Quat}
        />
      </Canvas>
    </div>
  )
}
