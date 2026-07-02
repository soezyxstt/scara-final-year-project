'use client';
import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useHMI } from '@/lib/hmi-context';
import type { ESPMode } from '@/lib/hmi-types';

const EXPECTED_MODE_MAP: Record<string, ESPMode> = {
  '/':           'SCARA',
  '/zn':         'ZN',
  '/test':       'TEST',
  '/eksperimen': 'TEST',
};

function resolveExpectedMode(pathname: string, tab: string | null): ESPMode | undefined {
  if (pathname === '/' && tab === 'rest') return 'ZN';
  return EXPECTED_MODE_MAP[pathname];
}

function ModeRouterInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');
  const { state, serial } = useHMI();
  const { serialStatus, currentMode } = state;

  useEffect(() => {
    if (serialStatus !== 'connected') return;
    const expectedMode = resolveExpectedMode(pathname, tab);
    if (expectedMode && currentMode !== expectedMode) {
      serial.sendCommand(`mode,${expectedMode.toLowerCase()}`).catch(() => {});
    }
  }, [pathname, tab, serialStatus, currentMode, serial]);

  return null;
}

export function ModeRouter() {
  return (
    <Suspense fallback={null}>
      <ModeRouterInner />
    </Suspense>
  );
}
