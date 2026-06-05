'use client';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const TestPageContent = dynamic(() => import('./test-page-content'), { ssr: false });

export default function TestPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-hmi-bg text-hmi-text animate-pulse">
        <span className="text-sm font-medium">Loading TEST Interface...</span>
      </div>
    }>
      <TestPageContent />
    </Suspense>
  );
}
