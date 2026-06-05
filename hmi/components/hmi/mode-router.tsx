'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useHMI } from '@/lib/hmi-context';

const MODE_MAP: Record<string, string> = {
  '/':     'mode,scara',
  '/zn':   'mode,zn',
  '/test': 'mode,test',
};

export function ModeRouter() {
  const pathname = usePathname();
  const { state, serial } = useHMI();
  const { serialStatus } = state;

  useEffect(() => {
    if (serialStatus !== 'connected') return;
    const cmd = MODE_MAP[pathname];
    if (cmd) {
      serial.sendCommand(cmd).catch(() => {});
    }
  }, [pathname, serialStatus, serial]);

  return null;
}
