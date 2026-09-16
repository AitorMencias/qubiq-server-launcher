// Genera los iconos de juego definitivos como SVG estáticos, uno por juego, en
// src/renderer/src/games/<juego>/icon.svg. Los píxeles del pico y los dientes
// del engranaje se calculan aquí una vez y quedan escritos como coordenadas.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Uso: node scripts/generate-game-icons.mjs  (desde la raíz del proyecto)
const REPO = process.cwd()
const W = '#ffffff'
const r2 = (n) => Math.round(n * 100) / 100

const stroke = (d, w = 3.4, extra = '') =>
  `<path d="${d}" fill="none" stroke="${W}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`
const fill = (d, color = W, extra = '') => `<path d="${d}" fill="${color}"${extra}/>`

// `squash` aplasta el engranaje en vertical: 1 es de frente, 0.5 es visto en
// diagonal, como el de Factorio.
function gear(cx, cy, rOut, rIn, teeth, squash = 1) {
  const pts = []
  for (let i = 0; i < teeth * 2; i++) {
    const a = (Math.PI / teeth) * i - Math.PI / 2
    const r = i % 2 === 0 ? rOut : rIn
    const spread = (Math.PI / teeth) * 0.42
    for (const da of [-spread, spread]) {
      pts.push(`${r2(cx + r * Math.cos(a + da))} ${r2(cy + r * squash * Math.sin(a + da))}`)
    }
  }
  return `M${pts.join(' L')}Z`
}

// Engranaje en diagonal con grosor: la cara inferior es el mismo perfil
// desplazado hacia abajo, y la superior se dibuja encima.
function isoGear() {
  const CX = 32, CY = 29, ROUT = 22, RIN = 14, TEETH = 8, SQ = 0.55, ALTO = 7
  const canto = []
  // El grosor se barre copia a copia: con saltos mayores quedan muescas en los
  // flancos de los dientes.
  for (let d = ALTO; d >= 1; d--) canto.push(fill(gear(CX, CY + d, ROUT, RIN, TEETH, SQ), '#a08a6e'))
  return (
    canto.join('') +
    fill(gear(CX, CY, ROUT, RIN, TEETH, SQ), W, ' fill-opacity=".95"') +
    `<ellipse cx="${CX}" cy="${CY}" rx="7" ry="${r2(7 * SQ)}" fill="#3d2212"/>` +
    `<ellipse cx="${CX}" cy="${CY}" rx="7" ry="${r2(7 * SQ)}" fill="none" stroke="#6b3f18" stroke-width="1.5"/>`
  )
}

// Barco vikingo: casco de media luna con proa y popa enroscadas, vela cuadrada
// a rayas y escudos en la borda.
function longship() {
  return (
    // Proa y popa.
    stroke('M11 41 Q4 33 9 25 Q14 29 14 35', 3.2) +
    stroke('M53 41 Q60 33 55 25 Q50 29 50 35', 3.2) +
    // Mástil y verga.
    stroke('M32 41 V10', 3) +
    stroke('M17 15 H47', 3) +
    // Vela, con dos franjas del color del fondo.
    fill('M18 15 H46 L44 33 Q32 37 20 33 Z', W, ' fill-opacity=".95"') +
    fill('M25.5 15 H30 L29.5 35.2 Q27 34.8 24.8 34 Z', '#12304e', ' fill-opacity=".55"') +
    fill('M35 15 H39.5 L40.5 34 Q38.2 34.8 35.6 35.2 Z', '#12304e', ' fill-opacity=".55"') +
    // Casco.
    fill('M10 40 Q32 45 54 40 Q32 57 10 40 Z') +
    // Escudos colgados de la borda.
    `<circle cx="20" cy="42.6" r="2.7" fill="#12304e" fill-opacity=".55"/>` +
    `<circle cx="26" cy="43.5" r="2.7" fill="#12304e" fill-opacity=".55"/>` +
    `<circle cx="32" cy="43.8" r="2.7" fill="#12304e" fill-opacity=".55"/>` +
    `<circle cx="38" cy="43.5" r="2.7" fill="#12304e" fill-opacity=".55"/>` +
    `<circle cx="44" cy="42.6" r="2.7" fill="#12304e" fill-opacity=".55"/>` +
    // Mar.
    stroke('M4 51 Q12 47 20 51 T36 51 T52 51 T62 51', 3, ' stroke-opacity=".7"') +
    stroke('M8 57 Q16 53 24 57 T40 57 T56 57', 3, ' stroke-opacity=".4"')
  )
}

// Carga explosiva: tres bloques atados con cinchas y el temporizador encajado
// encima. Van dentro de una sola silueta: con el temporizador suelto parecía
// una etiqueta colgando del fardo.
function c4Charge() {
  const SILUETA = 'M34 10 H51 V24 H52 V53 H12 V24 H34 Z'
  return (
    // Antena.
    stroke('M47.5 10 V4.5', 2.2) +
    // Fardo: tres bloques con la junta a la vista.
    fill('M12 24 H52 V33 H12 Z', W, ' fill-opacity=".95"') +
    fill('M12 34.5 H52 V43.5 H12 Z', W, ' fill-opacity=".95"') +
    fill('M12 45 H52 V53 H12 Z', W, ' fill-opacity=".82"') +
    `<path d="M12 33 H52 M12 34.5 H52 M12 43.5 H52 M12 45 H52" fill="none" stroke="#5e120d" stroke-opacity=".3" stroke-width="1"/>` +
    // Cinchas: solo sobresalen por abajo, para no romper el contorno de arriba.
    fill('M19 24 H25 V55 H19 Z', '#5e120d', ' fill-opacity=".58"') +
    fill('M39 24 H45 V55 H39 Z', '#5e120d', ' fill-opacity=".58"') +
    // Temporizador, apoyado en el fardo y tapando la junta de debajo.
    fill('M34 10 H51 V24.5 H34 Z', W, ' fill-opacity=".95"') +
    fill('M36.5 13.5 H48.5 V18.5 H36.5 Z', '#5e120d') +
    `<path d="M38.5 16 H41 M42.5 16 H45" fill="none" stroke="#ff9a76" stroke-width="1.5" stroke-linecap="round"/>` +
    `<path d="M34 21 H51" fill="none" stroke="#5e120d" stroke-opacity=".3" stroke-width="1"/>` +
    // Contorno común: cierra el conjunto por arriba.
    `<path d="${SILUETA}" fill="none" stroke="#5e120d" stroke-opacity=".5" stroke-width="1.6" stroke-linejoin="round"/>`
  )
}

// Punta de bastón: dos brazos que sostienen una gema encendida.
function staffTip() {
  const rays = []
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2
    const [x0, y0] = [32 + 15 * Math.cos(a), 24 + 15 * Math.sin(a)]
    const [x1, y1] = [32 + 19 * Math.cos(a), 24 + 19 * Math.sin(a)]
    rays.push(`M${r2(x0)} ${r2(y0)} L${r2(x1)} ${r2(y1)}`)
  }
  return (
    `<path d="${rays.join(' ')}" fill="none" stroke="#ffd27a" stroke-opacity=".6" stroke-width="2.2" stroke-linecap="round"/>` +
    // Vara y anillas: cortas, para que mande la punta.
    stroke('M32 58 V40', 5) +
    stroke('M26.5 42 H37.5 M27.5 47 H36.5', 2.6) +
    // Brazos que abrazan la gema.
    stroke('M25 39 Q16 23 27 12', 3.8) +
    stroke('M39 39 Q48 23 37 12', 3.8) +
    // Gema.
    fill('M32 10 L40.5 24 L32 38 L23.5 24 Z', '#ffd27a') +
    fill('M32 10 L40.5 24 L32 24 Z', '#fff0cc')
  )
}

// Cara de zombi: cabeza con mandíbula marcada, cuencas hundidas y costurón.
function zombieFace() {
  return (
    // Cabeza algo torcida y con la mandíbula estrecha: la simetría perfecta
    // hacía que pareciese un robot.
    fill('M18 17 Q18 11 24 10.5 H41 Q46 11 46 17 L45 35 Q44 46 31 53 Q19 45 18.5 34 Z', W, ' fill-opacity=".93"') +
    // Sombra del ceño.
    fill('M20 20 Q32 17.5 45 19.5 L44.5 23 Q32 21 20.3 23.5 Z', '#2e3617', ' fill-opacity=".35"') +
    // Cuencas desiguales: la izquierda más grande y caída.
    `<ellipse cx="26" cy="29" rx="5.6" ry="6.2" fill="#2e3617"/>` +
    `<ellipse cx="38" cy="27" rx="4.2" ry="4.8" fill="#2e3617"/>` +
    `<circle cx="27.4" cy="30.4" r="1.7" fill="${W}" fill-opacity=".8"/>` +
    `<circle cx="36.9" cy="26" r="1.3" fill="${W}" fill-opacity=".8"/>` +
    // Boca abierta y desdentada, con el borde superior mellado.
    fill('M23.5 40.5 Q32 38.5 40.5 40.5 L40 46.5 Q32 50 24 46.5 Z', '#2e3617') +
    fill('M26 40.2 H28.4 V43.6 H26 Z M30.8 39.6 H33.2 V43.4 H30.8 Z M35.6 40.2 H38 V43.4 H35.6 Z', W, ' fill-opacity=".88"') +
    // Costurón en la frente.
    `<path d="M21.5 16 L30 14" fill="none" stroke="#2e3617" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M23 14.4 L24 17.4 M25.8 13.8 L26.8 16.8 M28.4 13.4 L29.2 16.2" fill="none" stroke="#2e3617" stroke-width="1.3" stroke-linecap="round"/>`
  )
}

// Central nuclear: torre de refrigeración hiperbólica con la columna de
// refrigerante iluminada, los montantes naranjas y la banda de peligro de la
// plataforma. Formas propias, no una copia del edificio (ANALISIS.md §13.1).
function nuclearPlant() {
  // El perfil de la torre es una cuadrática cuya y resulta lineal:
  // y = 13 + 38t, x = 17.5 + 16t − 20.5t². Así se puede medir el ancho a
  // cualquier altura y encajar las franjas horizontales.
  const TOWER = 'M17.5 13 Q25.5 32 13 51 H51 Q38.5 32 46.5 13 Z'
  const edge = (y) => { const t = (y - 13) / 38; return 17.5 + 16 * t - 20.5 * t * t }
  const mirror = (x) => r2(64 - x)
  const band = (y0, y1) => {
    const a = edge(y0), b = edge(y1)
    return `M${r2(a)} ${y0} H${mirror(a)} L${mirror(b)} ${y1} H${r2(b)} Z`
  }
  const SHELL = '#46515e', RIB = '#1b2129', MOUTH = '#222a33', RING = '#5b7fc7'
  return (
    fill(TOWER, SHELL) +
    fill(band(16.5, 20.5), RING) +
    `<ellipse cx="32" cy="13" rx="14.5" ry="3.8" fill="${MOUTH}"/>` +
    `<ellipse cx="32" cy="13" rx="14.5" ry="3.8" fill="none" stroke="${RING}" stroke-width="1.6"/>` +
    // Nervios de la torre, siguiendo su curvatura.
    `<path d="M24.5 20.5 Q22.5 35 20.5 49 M39.5 20.5 Q41.5 35 43.5 49" fill="none" stroke="${RIB}" stroke-width="1.1" stroke-linecap="round"/>` +
    // Torre frontal: montantes, carcasa y columna de refrigerante.
    // Montantes en crema, no en naranja: el azulejo ya es naranja y se perdían.
    fill('M24 13 H27 V52 H24 Z M37 13 H40 V52 H37 Z', '#ffe2b8') +
    fill('M26.8 15 H37.2 V52 H26.8 Z', '#2b333d') +
    fill('M28.4 18.5 H35.6 V47 H28.4 Z', '#48d6d0') +
    fill('M28.4 18.5 H32 V47 H28.4 Z', '#8ef0ea', ' fill-opacity=".55"') +
    `<path d="M26.8 15 H37.2 V52 H26.8 Z" fill="none" stroke="${RIB}" stroke-width="1"/>` +
    `<circle cx="32" cy="49" r="2.6" fill="${MOUTH}" stroke="${RIB}" stroke-width="1"/>` +
    // Plataforma con la banda de peligro.
    fill('M10 51.5 H54 V57 H10 Z', '#4a545f') +
    fill(
      'M12.5 54 h4.5 l-2.8 3 h-4.5 Z M20 54 h4.5 l-2.8 3 h-4.5 Z M27.5 54 h4.5 l-2.8 3 h-4.5 Z' +
        ' M35 54 h4.5 l-2.8 3 h-4.5 Z M42.5 54 h4.5 l-2.8 3 h-4.5 Z',
      '#f0b429'
    ) +
    `<path d="M10 51.5 H54 V57 H10 Z" fill="none" stroke="${RIB}" stroke-width="1"/>` +
    // Contorno: la torre es oscura y sin él se pierde sobre el azulejo.
    `<path d="${TOWER}" fill="none" stroke="${W}" stroke-width="1.8" stroke-linejoin="round"/>`
  )
}

// Bloque de hierba en isométrico, con la hierba azul y la tierra azul oscuro: es
// la forma reconocible del juego sin reproducir su textura (ANALISIS.md §13.1).
function grassBlock() {
  const T = [32, 10], R = [54, 23], B = [32, 36], L = [10, 23]
  const ALTO = 18, N = 8
  // Cada cara se parametriza con dos ejes; P(u,v) da un punto del lienzo.
  const faces = {
    top: (u, v) => [32 + 22 * u - 22 * v, 10 + 13 * u + 13 * v],
    left: (u, v) => [10 + 22 * u, 23 + 13 * u + ALTO * v],
    right: (u, v) => [54 - 22 * u, 23 + 13 * u + ALTO * v]
  }
  const texel = (face, i, j) => {
    const p = faces[face]
    const q = [p(i / N, j / N), p((i + 1) / N, j / N), p((i + 1) / N, (j + 1) / N), p(i / N, (j + 1) / N)]
    return `M${q.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(' L')} Z`
  }
  // Aleatoriedad reproducible: el mismo icono en cada ejecución.
  const dice = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
  const P = {
    top: { base: '#45a3e8', specks: ['#5cb4f2', '#3691d6', '#66bdf7'] },
    left: { grass: '#3a93d4', dirt: '#1e3f73', specks: ['#254b86', '#17325c'] },
    right: { grass: '#2c7bbb', dirt: '#16305a', specks: ['#1c3c6d', '#102142'] }
  }
  const specks = (face, seed, colors, skip = () => false) => {
    const r = dice(seed)
    const out = []
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (skip(i, j) || r() > 0.26) continue
      out.push(fill(texel(face, i, j), colors[Math.floor(r() * colors.length)]))
    }
    return out.join('')
  }
  // Profundidad del fleco de hierba por columna: 1 o 2 téxeles, para que el
  // borde inferior quede dentado como en un bloque de verdad.
  const fringe = (seed) => { const r = dice(seed); return Array.from({ length: N }, () => (r() > 0.5 ? 2 : 1)) }
  const fL = fringe(7), fR = fringe(19)
  const band = (face, depth, color) => {
    const out = []
    for (let i = 0; i < N; i++) for (let j = 0; j < depth[i]; j++) out.push(fill(texel(face, i, j), color))
    return out.join('')
  }
  return (
    fill(`M${T[0]} ${T[1]} L${R[0]} ${R[1]} L${B[0]} ${B[1]} L${L[0]} ${L[1]} Z`, P.top.base) +
    specks('top', 3, P.top.specks) +
    fill(`M${L[0]} ${L[1]} L${B[0]} ${B[1]} L${B[0]} ${B[1] + ALTO} L${L[0]} ${L[1] + ALTO} Z`, P.left.dirt) +
    fill(`M${R[0]} ${R[1]} L${B[0]} ${B[1]} L${B[0]} ${B[1] + ALTO} L${R[0]} ${R[1] + ALTO} Z`, P.right.dirt) +
    band('left', fL, P.left.grass) + band('right', fR, P.right.grass) +
    specks('left', 11, P.left.specks, (i, j) => j < fL[i]) +
    specks('right', 23, P.right.specks, (i, j) => j < fR[i]) +
    // Silueta: separa el bloque del fondo a tamaños pequeños.
    `<path d="M${T[0]} ${T[1]} L${R[0]} ${R[1]} L${R[0]} ${R[1] + ALTO} L${B[0]} ${B[1] + ALTO} L${L[0]} ${L[1] + ALTO} L${L[0]} ${L[1]} Z"` +
    ' fill="none" stroke="#ffffff" stroke-opacity=".3" stroke-width="1.2" stroke-linejoin="round"/>'
  )
}

// Pico en pixel art propio: curva y mango rasterizados en una rejilla de 12×12.
// Las celdas contiguas de cada fila se unen en un solo rectángulo.
function pixelPickaxe() {
  const cell = 3.6, ox = 10.4, oy = 10.4
  const head = (t) => {
    const p0 = [2.2, 2.6], c = [10.2, 1.8], p1 = [9.4, 9.8]
    return [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]]
  }
  const dHead = (x, y) => {
    let best = 99
    for (let i = 0; i <= 60; i++) { const [hx, hy] = head(i / 60); best = Math.min(best, Math.hypot(hx - x, hy - y)) }
    return best
  }
  const dHandle = (x, y) => {
    const [ax, ay, bx, by] = [7.8, 4.2, 1.6, 10.4]
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)))
    return Math.hypot(ax + t * (bx - ax) - x, ay + t * (by - ay) - y)
  }
  const rows = []
  for (let gy = 0; gy < 12; gy++) {
    const row = []
    for (let gx = 0; gx < 12; gx++) {
      const x = gx + 0.5, y = gy + 0.5
      let c = null
      if (dHandle(x, y) < 0.95) c = '#f3dcb8'
      if (dHead(x, y) < 1.25) c = W
      row.push(c)
    }
    rows.push(row)
  }
  const out = []
  rows.forEach((row, gy) => {
    let start = 0
    for (let gx = 1; gx <= 12; gx++) {
      if (gx === 12 || row[gx] !== row[start]) {
        if (row[start]) {
          out.push(`<rect x="${r2(ox + start * cell)}" y="${r2(oy + gy * cell)}" width="${r2((gx - start) * cell + 0.05)}" height="${r2(cell + 0.05)}" fill="${row[start]}"/>`)
        }
        start = gx
      }
    }
  })
  return out.join('')
}

const GAMES = [
  { id: 'minecraft', name: 'Minecraft', top: '#5aab55', bottom: '#2c6a33', node: '#d8ffb8',
    // El bloque ya llena el azulejo y tiene textura propia: sin puntos de luz,
    // que asomaban por fuera de la silueta.
    art: () => grassBlock(), nodes: [] },
  { id: 'satisfactory', name: 'Satisfactory', top: '#f2913a', bottom: '#93400d', node: '#ffb54d',
    // La central ya llena el azulejo y tiene color propio: sin puntos de luz.
    art: () => nuclearPlant(), nodes: [] },
  { id: 'valheim', name: 'Valheim', top: '#3f86bd', bottom: '#12304e', node: '#ff9a3c',
    art: () => longship(), nodes: [] },
  { id: 'zomboid', name: 'Project Zomboid', top: '#7a8a3f', bottom: '#2e3617', node: '#ffd0c4',
    art: () => zombieFace(), nodes: [] },
  { id: 'enshrouded', name: 'Enshrouded', top: '#3247a0', bottom: '#131a44', node: '#ffd27a',
    art: () => staffTip(), nodes: [[32, 23]] },
  { id: 'rust', name: 'Rust', top: '#c0392b', bottom: '#5e120d', node: '#ffd9b8',
    art: () => c4Charge(), nodes: [] },
  { id: 'factorio', name: 'Factorio', top: '#8a5a30', bottom: '#3d2212', node: '#fff0c2',
    art: () => isoGear(), nodes: [] }
]

function svg(g) {
  // Ids con el juego delante: si varios iconos se insertan en la misma página
  // (en línea, no como <img>), sus degradados y filtros no se pisan.
  const id = `qubiq-${g.id}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${g.name}">
<!-- Icono propio de QubiQ Server Launcher (GPLv3). No es un logotipo oficial de ${g.name}
     ni está hecho a partir de él: evoca el tema del juego sin usar sus marcas.
     Criterio en ANALISIS.md §13.1. -->
<defs>
<linearGradient id="${id}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g.top}"/><stop offset="1" stop-color="${g.bottom}"/></linearGradient>
<filter id="${id}-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect x="1" y="1" width="62" height="62" rx="15" fill="url(#${id}-bg)"/>
<rect x="1.5" y="1.5" width="61" height="61" rx="14.5" fill="none" stroke="#ffffff" stroke-opacity=".16"/>
<path d="M3 16 Q3 3 16 3 H48 Q61 3 61 16 V20 Q32 12 3 26 Z" fill="#ffffff" fill-opacity=".07"/>
${g.art()}
${g.nodes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.9" fill="${g.node}" filter="url(#${id}-glow)"/>`).join('\n')}
</svg>
`
}

for (const g of GAMES) {
  const dir = join(REPO, 'src', 'renderer', 'src', 'games', g.id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'icon.svg'), svg(g))
  console.log(`${g.id}/icon.svg`)
}
