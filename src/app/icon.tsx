import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

// The Stipt app icon: just the amber dot from the wordmark, on the
// primary teal — "the dot alone is the app icon" per the brand guide.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: '#0F766E',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#E4952B' }} />
      </div>
    ),
    { ...size }
  )
}
