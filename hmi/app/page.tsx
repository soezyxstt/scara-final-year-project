'use client'

import dynamic from 'next/dynamic'

const HMIRoot = dynamic(
  () => import('@/components/hmi/hmi-root').then((mod) => mod.HMIRoot),
  { ssr: false }
)

export default function Page() {
  return <HMIRoot />
}
