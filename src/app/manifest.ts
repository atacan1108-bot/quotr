import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Stipt',
    short_name: 'Stipt',
    description: 'Offerte én factuur. Stipt geregeld.',
    start_url: '/quotes',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FAF6EC',
    theme_color: '#0F766E',
    icons: [
      {
        src: '/icons/icon-192.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  }
}
