'use client'

/**
 * A plain HTML5 canvas signature pad — no dependency. Uses the Pointer
 * Events API so one set of handlers covers mouse, touch, and pen, and
 * `setPointerCapture` means drawing keeps working even if the finger/cursor
 * strays outside the canvas mid-stroke.
 */
import { useRef, useState, useLayoutEffect } from 'react'

interface Props {
  onChange: (dataUrl: string | null) => void
}

const HEIGHT = 160

export default function SignaturePad({ onChange }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const drawingRef   = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const hasSignatureRef = useRef(false)
  const [hasSignature, setHasSignature] = useState(false)

  // Size the canvas to its container once, at the device's actual pixel
  // density, so the line is crisp on retina screens instead of blurry.
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const width = container.clientWidth
    const dpr = window.devicePixelRatio || 1
    canvas.width  = width * dpr
    canvas.height = HEIGHT * dpr
    canvas.style.width  = `${width}px`
    canvas.style.height = `${HEIGHT}px`
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
      ctx.lineCap  = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 2.5
      ctx.strokeStyle = '#1C1C1E'
    }
  }, [])

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    lastPointRef.current = pointFromEvent(e)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !lastPointRef.current) return
    const point = pointFromEvent(e)
    ctx.beginPath()
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastPointRef.current = point
    if (!hasSignatureRef.current) {
      hasSignatureRef.current = true
      setHasSignature(true)
    }
  }

  function stopDrawing() {
    if (!drawingRef.current) return
    drawingRef.current = false
    lastPointRef.current = null
    if (hasSignatureRef.current && canvasRef.current) {
      onChange(canvasRef.current.toDataURL('image/png'))
    }
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      const dpr = window.devicePixelRatio || 1
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    }
    hasSignatureRef.current = false
    setHasSignature(false)
    onChange(null)
  }

  return (
    <div>
      <div
        ref={containerRef}
        className="w-full rounded-xl border-2 border-dashed border-border bg-surface overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          onPointerLeave={stopDrawing}
          style={{ touchAction: 'none', display: 'block' }}
          className="cursor-crosshair"
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-muted">{hasSignature ? 'Looks good.' : 'Draw your signature above'}</p>
        {hasSignature && (
          <button
            type="button"
            onClick={clear}
            className="text-xs font-medium text-muted hover:text-red-500 transition"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
