import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'
import { Providers } from './providers'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SCARA HMI',
  description: 'Web-based HMI for SCARA robot via Web Serial API',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="h-full bg-hmi-bg text-hmi-text antialiased overflow-hidden">
        <Providers>
          {children}
          <Toaster theme="dark" richColors closeButton position="top-right" />
        </Providers>
      </body>
    </html>
  )
}
