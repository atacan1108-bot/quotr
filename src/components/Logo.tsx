/**
 * The Stipt wordmark: "Stipt" in Space Grotesk Bold, followed by a small
 * amber dot (the same dot that's the app icon on its own). Three variants
 * for the three backgrounds it appears on across the app.
 */
const VARIANT_TEXT_COLOR = {
  paper: 'var(--inkt)',   // white/paper cards — auth pages, settings footer
  teal: '#ffffff',         // on a --diep-teal surface (e.g. a colored banner)
  night: '#ffffff',        // on a --nacht-teal surface (dark footers)
} as const

export default function Logo({
  variant = 'paper',
  size = 'md',
  className = '',
}: {
  variant?: 'paper' | 'teal' | 'night'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const fontSize = size === 'sm' ? '18px' : size === 'lg' ? '28px' : '22px'
  const dotSize = size === 'sm' ? '5px' : size === 'lg' ? '8px' : '6px'

  return (
    <span className={`inline-flex items-baseline gap-[2px] ${className}`}>
      <span
        style={{
          fontFamily: 'var(--font-display), ui-sans-serif, system-ui, sans-serif',
          fontWeight: 700,
          fontSize,
          letterSpacing: '-0.04em',
          color: VARIANT_TEXT_COLOR[variant],
        }}
      >
        Stipt
      </span>
      <span
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          background: '#E4952B',
          marginBottom: size === 'lg' ? '4px' : '3px',
        }}
      />
    </span>
  )
}
