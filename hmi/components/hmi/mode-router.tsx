'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useHMI } from '@/lib/hmi-context';
import type { ESPMode } from '@/lib/hmi-types';

const EXPECTED_MODE_MAP: Record<string, ESPMode> = {
  '/':     'SCARA',
  '/zn':   'ZN',
  '/test': 'TEST',
};

export function ModeRouter() {
  const pathname = usePathname();
  const { state, serial } = useHMI();
  const { serialStatus, currentMode } = state;

  useEffect(() => {
    if (serialStatus !== 'connected') return;
    const expectedMode = EXPECTED_MODE_MAP[pathname];
    if (expectedMode && currentMode !== expectedMode) {
      serial.sendCommand(`mode,${expectedMode.toLowerCase()}`).catch(() => {});
    }
  }, [pathname, serialStatus, currentMode, serial]);

  return null;
}
