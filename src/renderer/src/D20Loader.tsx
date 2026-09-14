import { useEffect, useRef } from 'react'

/**
 * Cargador D20: el icono de la app, sin placa, girando de forma semi-errática.
 *
 * Gira como un sólido rígido, así que las aristas unen siempre los mismos
 * vértices pase lo que pase. Lo errático sale de dos cosas: el eje de giro
 * persigue un objetivo aleatorio que cambia cada poco (suavizado, para que no
 * dé tirones) y cada vértice "respira" a su propio ritmo, de modo que las
 * bolitas parecen ir por libre mientras las líneas las sujetan.
 *
 * Se usa donde se espera sin un porcentaje real que enseñar: indica que algo
 * está pasando sin inventarse un progreso.
 */

interface Props {
  /** Lado en píxeles CSS. */
  size: number
  /** Multiplicador de la velocidad de giro. */
  speed?: number
  /** 0 = giro tranquilo; 1 = cambios de rumbo frecuentes y vértices muy vivos. */
  jitter?: number
  className?: string
}

/** Los valores elegidos para toda la app. */
export const LOADER_SPEED = 0.6
export const LOADER_JITTER = 1

type Vec = [number, number, number]
type Mat = [Vec, Vec, Vec]

const PHI = (1 + Math.sqrt(5)) / 2

function geometry(): { unit: Vec[]; edges: [number, number][] } {
  const raw: Vec[] = []
  for (const a of [-1, 1]) {
    for (const b of [-PHI, PHI]) raw.push([0, a, b], [a, b, 0], [b, 0, a])
  }
  const radius = Math.hypot(1, PHI)
  const edges: [number, number][] = []
  for (let i = 0; i < raw.length; i++) {
    for (let j = i + 1; j < raw.length; j++) {
      const p = raw[i]!
      const q = raw[j]!
      if (Math.abs(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) - 2) < 1e-6) edges.push([i, j])
    }
  }
  return { unit: raw.map((v) => [v[0] / radius, v[1] / radius, v[2] / radius]), edges }
}

const { unit: UNIT, edges: EDGES } = geometry()

const normalize = (v: Vec): Vec => {
  const l = Math.hypot(v[0], v[1], v[2])
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** Aplica un giro y reortogonaliza, para que el redondeo no deforme el dado. */
function rotate(m: Mat, axis: Vec, angle: number): Mat {
  const [x, y, z] = axis
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const t = 1 - c
  const r: Mat = [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c]
  ]
  const mul = (row: Vec): Vec => [
    row[0] * m[0][0] + row[1] * m[1][0] + row[2] * m[2][0],
    row[0] * m[0][1] + row[1] * m[1][1] + row[2] * m[2][1],
    row[0] * m[0][2] + row[1] * m[1][2] + row[2] * m[2][2]
  ]
  const a = normalize(mul(r[0]))
  const rawB = mul(r[1])
  const proj = a[0] * rawB[0] + a[1] * rawB[1] + a[2] * rawB[2]
  const b = normalize([rawB[0] - a[0] * proj, rawB[1] - a[1] * proj, rawB[2] - a[2] * proj])
  return [a, b, [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]]
}

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo)

function randomAxis(): Vec {
  const u = rand(-1, 1)
  const theta = rand(0, Math.PI * 2)
  const r = Math.sqrt(1 - u * u)
  return [r * Math.cos(theta), r * Math.sin(theta), u]
}

export function D20Loader({
  size,
  speed = LOADER_SPEED,
  jitter = LOADER_JITTER,
  className
}: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Los valores se leen en cada fotograma: cambiarlos no reinicia el giro.
  const settings = useRef({ speed, jitter })
  settings.current = { speed, jitter }

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let m: Mat = rotate(rotate([[1, 0, 0], [0, 1, 0], [0, 0, 1]], [1, 0, 0], 0.5), [0, 1, 0], -0.6)
    let omega: Vec = randomAxis().map((v) => v * 1.2) as Vec
    let target: Vec = [...omega]
    let nextChange = 0
    const breath = UNIT.map(() => ({ f: rand(0.7, 1.9), p: rand(0, Math.PI * 2) }))

    let last = 0
    let t = 0
    let raf = 0

    const frame = (now: number): void => {
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016)
      last = now
      t += dt

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const px = Math.round(size * dpr)
      if (canvas.width !== px) {
        canvas.width = px
        canvas.height = px
      }

      const jit = reduced ? 0 : settings.current.jitter
      const spd = reduced ? 0.35 : settings.current.speed

      if (!reduced && t >= nextChange) {
        target = randomAxis().map((v) => v * rand(0.7, 2.1)) as Vec
        nextChange = t + rand(0.7, 2.6) / (0.5 + jit)
      }
      const ease = Math.min(1, dt * (1.2 + jit * 3))
      omega = [
        omega[0] + (target[0] - omega[0]) * ease,
        omega[1] + (target[1] - omega[1]) * ease,
        omega[2] + (target[2] - omega[2]) * ease
      ]
      const mag = Math.hypot(omega[0], omega[1], omega[2])
      if (mag > 1e-4) m = rotate(m, normalize(omega), mag * spd * dt)

      const scale = px * 0.34
      const u = px / 100
      const pts = UNIT.map((v, i) => {
        const b = breath[i]!
        const k = 1 + jit * 0.2 * Math.sin(t * b.f * 2.2 + b.p)
        const x = (m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2]) * k
        const y = (m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2]) * k
        const z = m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
        return { x: px / 2 + x * scale, y: px / 2 + y * scale, d: (z + 1) / 2 }
      })

      ctx.clearRect(0, 0, px, px)
      ctx.lineCap = 'round'

      const edges = EDGES.map(([a, b]) => ({ a: pts[a]!, b: pts[b]!, d: (pts[a]!.d + pts[b]!.d) / 2 }))
        .sort((p, q) => p.d - q.d)
      for (const e of edges) {
        const near = Math.pow(e.d, 1.4)
        if (e.d > 0.5) {
          ctx.strokeStyle = `rgba(63,155,255,${(near * 0.35).toFixed(3)})`
          ctx.lineWidth = u * (3 + near * 4)
          ctx.beginPath()
          ctx.moveTo(e.a.x, e.a.y)
          ctx.lineTo(e.b.x, e.b.y)
          ctx.stroke()
        }
        ctx.strokeStyle = `rgba(176,224,255,${(0.22 + near * 0.78).toFixed(3)})`
        ctx.lineWidth = u * (0.7 + near * 1.3)
        ctx.beginPath()
        ctx.moveTo(e.a.x, e.a.y)
        ctx.lineTo(e.b.x, e.b.y)
        ctx.stroke()
      }

      for (const p of [...pts].sort((a, b) => a.d - b.d)) {
        const r = u * (1.3 + p.d * 2.1)
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2)
        glow.addColorStop(0, `rgba(74,168,255,${(0.25 + p.d * 0.55).toFixed(3)})`)
        glow.addColorStop(1, 'rgba(74,168,255,0)')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `rgba(234,247,255,${(0.45 + p.d * 0.55).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size, flexShrink: 0 }}
      aria-hidden="true"
    />
  )
}
