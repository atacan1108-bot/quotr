import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Hanken_Grotesk, Space_Mono } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import './globals.css'

// The whole app's font system — same three fonts as the marketing page
// (src/components/marketing/MarketingHome.tsx), loaded once here instead
// of duplicated, since the portal now uses them too. Hanken Grotesk is
// body/UI text (--font-sans below), Space Grotesk is for headings
// (available as the `font-display` utility), Space Mono is for numbers —
// prices, totals, invoice/quote numbers (available as `font-mono`,
// already used by TemplateUploadSection's token-name display).
const spaceGrotesk = Space_Grotesk({ variable: '--font-space-grotesk', subsets: ['latin'], weight: ['500', '600', '700'] })
const hankenGrotesk = Hanken_Grotesk({ variable: '--font-hanken-grotesk', subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const spaceMono = Space_Mono({ variable: '--font-space-mono', subsets: ['latin'], weight: ['400', '700'] })

export const metadata: Metadata = {
  title: 'Stipt',
  description: 'Offerte én factuur. Stipt geregeld.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Stipt',
    startupImage: '/icons/icon-512.svg',
  },
  formatDetection: { telephone: false },
  applicationName: 'Stipt',
}

export const viewport: Viewport = {
  themeColor: '#0F766E',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <html lang={locale} className={`${spaceGrotesk.variable} ${hankenGrotesk.variable} ${spaceMono.variable}`}>
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
