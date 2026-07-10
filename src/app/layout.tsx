import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import './globals.css'

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Quotr',
  description: 'Professional quotes in under 2 minutes',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Quotr',
    startupImage: '/icons/icon-512.svg',
  },
  formatDetection: { telephone: false },
  applicationName: 'Quotr',
}

export const viewport: Viewport = {
  themeColor: '#0D9483',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <html lang={locale} className={geist.variable}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="bg-surface text-on-surface antialiased">

        <NextIntlClientProvider>
          <LanguageSwitcher />
          {children}
        </NextIntlClientProvider>

        {/*
          SW registration: when a new service worker takes over via clients.claim(),
          reload once so the page runs the fresh JS/CSS rather than whatever
          was in memory from the previous SW session.
        */}
        <script dangerouslySetInnerHTML={{ __html:
          `if('serviceWorker'in navigator){` +
          `var _r=false;` +
          `navigator.serviceWorker.addEventListener('controllerchange',function(){` +
          `if(!_r){_r=true;location.reload();}` +
          `});` +
          `navigator.serviceWorker.register('/sw.js');` +
          `}`
        }} />

      </body>
    </html>
  )
}
