import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import { Geist_Mono, Inter } from 'next/font/google'
import './globals.css'
import './console.css'
import './theme-refinement.css'
import { Providers } from './providers'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SCARA HMI',
  description: 'Web-based HMI for SCARA robot via Web Serial API',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()
  const sidebarOpen = (await cookies()).get('sidebar_state')?.value !== 'false'

  return (
    <html lang={locale} className={`${inter.variable} ${geistMono.variable} h-full`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme');
                  if (theme === 'light') {
                    document.documentElement.classList.add('light');
                  } else {
                    document.documentElement.classList.remove('light');
                  }
                } catch (e) {}
              })()
            `,
          }}
        />
      </head>
      <body className="h-full bg-hmi-bg text-hmi-text font-sans antialiased overflow-hidden">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers defaultSidebarOpen={sidebarOpen}>
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
